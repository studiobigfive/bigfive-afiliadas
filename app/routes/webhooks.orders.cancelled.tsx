import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { enviarNotificacaoCancelamento, enviarNotificacaoCancelamentoDesigner } from "../lib/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CANCELLED") return new Response("ok", { status: 200 });

  const order = payload as any;
  const shopifyOrderId = String(order.id);

  // Busca dados do pedido + afiliada para notificação ANTES de cancelar
  const { data: pedido, error: pedidoErr } = await supabase
    .from("pedidos")
    .select("id, comissao, afiliadas(nome, email)")
    .eq("shopify_order_id", shopifyOrderId)
    .single();
  if (pedidoErr && pedidoErr.code !== "PGRST116") {
    console.error("[webhook/cancelled] erro ao buscar pedido:", pedidoErr.message);
  }

  // Busca pedidos de designers (podem ser vários produtos no mesmo pedido) ANTES de cancelar
  const { data: pedidosDesigner } = await supabase
    .from("pedidos_designer")
    .select("id, comissao, nome_produto, designers(nome, email)")
    .eq("shopify_order_id", shopifyOrderId)
    .eq("cancelado", false);

  // Marca pedido de afiliada como cancelado
  await supabase
    .from("pedidos")
    .update({ cancelado: true })
    .eq("shopify_order_id", shopifyOrderId);

  // Marca pedidos de designers como cancelados no mesmo pedido
  await supabase
    .from("pedidos_designer")
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

  // Notifica cada designer afetado (pedido pode ter produtos de designers diferentes)
  for (const pd of pedidosDesigner ?? []) {
    const designer = pd.designers as any;
    if (designer?.email) {
      enviarNotificacaoCancelamentoDesigner(designer.email, designer.nome, pd.nome_produto, pd.comissao).catch(
        (e) => console.error("[webhook] Falha ao notificar cancelamento (designer):", e.message)
      );
    }
  }

  return new Response("ok", { status: 200 });
};
