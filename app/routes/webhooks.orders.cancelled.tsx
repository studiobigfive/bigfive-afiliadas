import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { enviarNotificacaoCancelamento } from "../lib/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CANCELLED") return new Response("ok", { status: 200 });

  const order = payload as any;
  const shopifyOrderId = String(order.id);

  // Busca dados do pedido + afiliada para notificação ANTES de cancelar
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, comissao, afiliadas(nome, email)")
    .eq("shopify_order_id", shopifyOrderId)
    .single();

  // Marca o pedido como cancelado (mantém histórico, zera comissão efetiva)
  await supabase
    .from("pedidos")
    .update({ cancelado: true })
    .eq("shopify_order_id", shopifyOrderId);

  // Issue #14: notifica a afiliada sobre o cancelamento
  if (pedido?.afiliadas) {
    const afiliada = pedido.afiliadas as any;
    if (afiliada.email) {
      enviarNotificacaoCancelamento(afiliada.email, afiliada.nome, pedido.comissao).catch(
        (e) => console.error("[webhook] Falha ao notificar cancelamento:", e.message)
      );
    }
  }

  return new Response("ok", { status: 200 });
};
