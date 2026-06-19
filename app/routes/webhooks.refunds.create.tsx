import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";

const round2 = (v: number) => Math.round(v * 100) / 100;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "REFUNDS_CREATE") return new Response("ok", { status: 200 });

  const refund = payload as any;
  const refundId = String(refund.id ?? "");
  const shopifyOrderId = String(refund.order_id);

  // ── Idempotência: ignora reentregas do mesmo reembolso ──────────────────────
  if (refundId) {
    const { data: jaProcessado } = await supabase
      .from("refunds_processados")
      .select("shopify_refund_id")
      .eq("shopify_refund_id", refundId)
      .single();
    if (jaProcessado) return new Response("ok", { status: 200 });
  }

  // Valor total reembolsado nesta nota (soma das transações)
  const valorReembolsado = round2(
    (refund.transactions ?? []).reduce(
      (s: number, t: any) => s + parseFloat(t.amount ?? "0"),
      0
    )
  );

  // refund_line_items: quais produtos foram devolvidos e quanto de cada um
  const refundLineItems: any[] = refund.refund_line_items ?? [];

  // ── AFILIADA (cupom) ─────────────────────────────────────────────────────
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, valor_total, comissao, comissao_base, valor_reembolsado")
    .eq("shopify_order_id", shopifyOrderId)
    .single();

  if (pedido && pedido.valor_total > 0) {
    // base = comissão original (fallback para a comissão atual em registros antigos)
    const base = pedido.comissao_base ?? pedido.comissao ?? 0;
    const novoReembolsado = round2((pedido.valor_reembolsado ?? 0) + valorReembolsado);
    const proporcao = Math.min(1, novoReembolsado / pedido.valor_total);
    const novaComissao = Math.max(0, round2(base * (1 - proporcao)));
    await supabase
      .from("pedidos")
      .update({ comissao: novaComissao, comissao_base: base, valor_reembolsado: novoReembolsado })
      .eq("id", pedido.id);
  }

  // ── DESIGNERS (produto) ────────────────────────────────────────────────────
  // Roda independente da afiliada: um pedido sem cupom ainda pode ter design.
  const { data: pedidosDesigner } = await supabase
    .from("pedidos_designer")
    .select("id, shopify_product_id, valor_item, comissao, comissao_base, valor_reembolsado")
    .eq("shopify_order_id", shopifyOrderId);

  if (pedidosDesigner && pedidosDesigner.length > 0) {
    // Soma o valor reembolsado por produto a partir dos refund_line_items
    const reembolsoPorProduto = new Map<string, number>();
    for (const rli of refundLineItems) {
      const productId = String(rli.line_item?.product_id ?? "");
      if (!productId) continue;
      const valor =
        parseFloat(rli.subtotal ?? "0") ||
        parseFloat(rli.line_item?.price ?? "0") * (rli.quantity ?? 0);
      reembolsoPorProduto.set(productId, (reembolsoPorProduto.get(productId) ?? 0) + valor);
    }

    // Proporção geral (fallback quando o reembolso não detalha line items)
    const totalItensDesigner = pedidosDesigner.reduce((s, p) => s + (p.valor_item ?? 0), 0);
    const proporcaoGeral =
      totalItensDesigner > 0 && valorReembolsado > 0
        ? Math.min(1, valorReembolsado / totalItensDesigner)
        : 0;

    for (const pd of pedidosDesigner) {
      const reembolsadoAgora =
        reembolsoPorProduto.size > 0
          ? reembolsoPorProduto.get(pd.shopify_product_id) ?? 0
          : round2((pd.valor_item ?? 0) * proporcaoGeral);
      if (reembolsadoAgora <= 0) continue;

      const base = pd.comissao_base ?? pd.comissao ?? 0;
      const novoReembolsado = round2((pd.valor_reembolsado ?? 0) + reembolsadoAgora);
      const proporcao = pd.valor_item > 0 ? Math.min(1, novoReembolsado / pd.valor_item) : 0;
      const novaComissao = Math.max(0, round2(base * (1 - proporcao)));
      await supabase
        .from("pedidos_designer")
        .update({ comissao: novaComissao, comissao_base: base, valor_reembolsado: novoReembolsado })
        .eq("id", pd.id);
    }
  }

  // ── Marca o reembolso como processado (idempotência) ────────────────────────
  if (refundId) {
    await supabase
      .from("refunds_processados")
      .insert({ shopify_refund_id: refundId, shopify_order_id: shopifyOrderId });
  }

  return new Response("ok", { status: 200 });
};
