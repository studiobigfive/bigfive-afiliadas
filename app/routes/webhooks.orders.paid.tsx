import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return new Response("ok", { status: 200 });

  const order = payload as any;
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
  const percentual = afiliada.percentual_comissao ?? 10;
  const comissao = Math.round(valorTotal * (percentual / 100) * 100) / 100;
  const mes = mesAtual();

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
