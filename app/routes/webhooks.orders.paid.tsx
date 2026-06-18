import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return new Response("ok", { status: 200 });

  const order = payload as any;

  // Barreira dupla: só processa se pagamento realmente confirmado
  // Protege contra Pix não pago, gateways bugados e pedidos cancelados
  if (order.financial_status !== "paid" || order.cancel_reason != null) {
    return new Response("ok", { status: 200 });
  }

  const discountCodes: string[] = (order.discount_codes ?? []).map((d: any) =>
    d.code?.toUpperCase()
  );

  if (discountCodes.length === 0) return new Response("ok", { status: 200 });

  // Verifica se algum cupom pertence a uma afiliada
  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("id, percentual_comissao")
    .in("cupom", discountCodes)
    .eq("ativo", true)
    .single();

  if (!afiliada) return new Response("ok", { status: 200 });

  const valorTotal = parseFloat(order.total_price ?? "0");
  const mes = mesAtual();

  // Total acumulado da afiliada no mês (excluindo este pedido se já existir)
  const { data: pedidosDoMes } = await supabase
    .from("pedidos")
    .select("valor_total")
    .eq("afiliada_id", afiliada.id)
    .eq("mes_referencia", mes)
    .neq("shopify_order_id", String(order.id));

  const totalAcumulado = (pedidosDoMes ?? []).reduce((s, p) => s + p.valor_total, 0);
  const novoTotal = totalAcumulado + valorTotal;

  // Busca tiers globais e determina qual se aplica ao novo total
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

  // Salva o pedido (ignora duplicata)
  await supabase.from("pedidos").upsert(
    {
      shopify_order_id: String(order.id),
      afiliada_id: afiliada.id,
      valor_total: valorTotal,
      comissao,
      mes_referencia: mes,
    },
    { onConflict: "shopify_order_id" }
  );

  return new Response("ok", { status: 200 });
};
