import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";
import { enviarNotificacaoPedido, enviarNotificacaoAdmin } from "../lib/email.server";

const PORTAL_URL = process.env.APP_URL ? `${process.env.APP_URL}/afiliada` : "https://bigfive-afiliadas.vercel.app/afiliada";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return new Response("ok", { status: 200 });

  const order = payload as any;

  // Barreira dupla: só processa se pagamento realmente confirmado
  if (order.financial_status !== "paid" || order.cancel_reason != null) {
    return new Response("ok", { status: 200 });
  }

  const discountCodes: string[] = (order.discount_codes ?? []).map((d: any) =>
    String(d.code ?? "").toUpperCase()
  );

  const mes = mesAtual();
  const shopifyOrderId = String(order.id);
  const valorTotal = parseFloat(order.total_price ?? "0");
  const lineItems: any[] = order.line_items ?? [];

  // ── AFILIADA (cupom) ─────────────────────────────────────────────────────
  if (discountCodes.length > 0) {
    const { data: afiliada } = await supabase
      .from("afiliadas")
      .select("id, nome, email, cupom")
      .in("cupom", discountCodes)
      .eq("ativo", true)
      .single();

    if (afiliada) {
      // Issue #2: verifica se já existe ANTES do upsert para não reenviar notificações
      const { data: pedidoExistente } = await supabase
        .from("pedidos")
        .select("id")
        .eq("shopify_order_id", shopifyOrderId)
        .single();

      const isPrimeiroPedido = !pedidoExistente;

      // Issue #1: exclui cancelados do acumulado para cálculo de tier correto
      const { data: pedidosDoMes } = await supabase
        .from("pedidos")
        .select("valor_total")
        .eq("afiliada_id", afiliada.id)
        .eq("mes_referencia", mes)
        .eq("cancelado", false)
        .neq("shopify_order_id", shopifyOrderId);

      const totalAcumulado = (pedidosDoMes ?? []).reduce((s: number, p: any) => s + p.valor_total, 0);
      const novoTotal = totalAcumulado + valorTotal;

      const { data: tiers } = await supabase
        .from("tiers_comissao")
        .select("vendas_ate, percentual")
        .order("vendas_ate", { ascending: true, nullsFirst: false });

      const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => {
        if (a.vendas_ate == null) return 1;
        if (b.vendas_ate == null) return -1;
        return a.vendas_ate - b.vendas_ate;
      });

      const tier = tiersOrdenados.find(t => t.vendas_ate == null || novoTotal <= t.vendas_ate)
        ?? { percentual: 10 };

      const comissao = Math.round(valorTotal * (tier.percentual / 100) * 100) / 100;

      await supabase.from("pedidos").upsert(
        { shopify_order_id: shopifyOrderId, afiliada_id: afiliada.id, valor_total: valorTotal, comissao, mes_referencia: mes },
        { onConflict: "shopify_order_id" }
      );

      if (isPrimeiroPedido) {
        if (afiliada.email) {
          enviarNotificacaoPedido(afiliada.email, afiliada.nome, valorTotal, comissao, mes, PORTAL_URL).catch(
            (e) => console.error("[webhook] Falha ao notificar afiliada:", e.message)
          );
        }
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
          enviarNotificacaoAdmin(adminEmail, afiliada.nome, afiliada.cupom ?? "", valorTotal, comissao).catch(
            (e) => console.error("[webhook] Falha ao notificar admin:", e.message)
          );
        }
      }
    }
  }

  // ── DESIGNERS (produto) ──────────────────────────────────────────────────
  // Roda sempre, independente de cupom — verifica produtos do pedido
  const productIds = [...new Set(
    lineItems.map((li: any) => String(li.product_id)).filter(Boolean)
  )];

  if (productIds.length > 0) {
    const { data: vinculados } = await supabase
      .from("designer_produtos")
      .select("designer_id, shopify_product_id, nome_produto, designers(id, nome, percentual, cupom, ativo)")
      .in("shopify_product_id", productIds);

    // Mapeia product_id → line_item para acesso rápido
    const liPorProduto = new Map<string, any>();
    for (const li of lineItems) {
      if (li.product_id) liPorProduto.set(String(li.product_id), li);
    }

    for (const v of vinculados ?? []) {
      const d = v.designers as any;
      if (!d?.ativo) continue;

      // Regra de sobreposição: se o cupom do designer foi usado neste pedido,
      // a comissão de cupom (afiliadas) já cobre — não duplica com design
      if (d.cupom && discountCodes.includes(String(d.cupom).toUpperCase())) continue;

      const li = liPorProduto.get(v.shopify_product_id);
      if (!li) continue;

      const valorItem = Math.round(parseFloat(li.price) * (li.quantity ?? 1) * 100) / 100;
      const comissaoDesigner = Math.round(valorItem * (d.percentual / 100) * 100) / 100;

      await supabase.from("pedidos_designer").upsert(
        {
          shopify_order_id: shopifyOrderId,
          designer_id: v.designer_id,
          shopify_product_id: v.shopify_product_id,
          nome_produto: v.nome_produto || li.title || li.name || "",
          valor_item: valorItem,
          comissao: comissaoDesigner,
          mes_referencia: mes,
        },
        { onConflict: "shopify_order_id,designer_id,shopify_product_id" }
      );
    }
  }

  return new Response("ok", { status: 200 });
};
