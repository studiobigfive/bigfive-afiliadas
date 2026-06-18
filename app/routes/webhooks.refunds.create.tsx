import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "REFUNDS_CREATE") return new Response("ok", { status: 200 });

  const refund = payload as any;
  const shopifyOrderId = String(refund.order_id);

  // Encontra o pedido no sistema de afiliadas
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, valor_total, comissao")
    .eq("shopify_order_id", shopifyOrderId)
    .single();

  if (!pedido) return new Response("ok", { status: 200 });

  // Calcula o valor reembolsado
  const valorReembolsado = parseFloat(refund.transactions?.[0]?.amount ?? "0");
  if (valorReembolsado <= 0) return new Response("ok", { status: 200 });

  // Reduz comissão proporcionalmente ao reembolso
  // Ex: reembolso de 50% do pedido → reduz 50% da comissão
  const proporcao = Math.min(1, valorReembolsado / pedido.valor_total);
  const reducao = Math.round(pedido.comissao * proporcao * 100) / 100;
  const novaComissao = Math.max(0, Math.round((pedido.comissao - reducao) * 100) / 100);

  await supabase.from("pedidos").update({ comissao: novaComissao }).eq("id", pedido.id);

  return new Response("ok", { status: 200 });
};
