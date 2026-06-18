import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CANCELLED") return new Response("ok", { status: 200 });

  const order = payload as any;
  const shopifyOrderId = String(order.id);

  // Marca o pedido como cancelado (mantém histórico, zera comissão efetiva)
  await supabase
    .from("pedidos")
    .update({ cancelado: true })
    .eq("shopify_order_id", shopifyOrderId);

  return new Response("ok", { status: 200 });
};
