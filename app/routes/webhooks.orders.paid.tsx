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
  // Protege contra Pix não pago, gateways bugados e pedidos cancelados
  if (order.financial_status !== "paid" || order.cancel_reason != null) {
    return new Response("ok", { status: 200 });
  }

  const discountCodes: string[] = (order.discount_codes ?? []).map((d: any) =>
    d.code?.toUpperCase()
  );

  if (discountCodes.length === 0) return new Response("ok", { status: 200 });

  // Verifica se algum cupom pertence a uma afiliada ativa
  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("id, nome, email, cupom")
    .in("cupom", discountCodes)
    .eq("ativo", true)
    .single();

  if (!afiliada) return new Response("ok", { status: 200 });

  const valorTotal = parseFloat(order.total_price ?? "0");
  const mes = mesAtual();

  // Issue #2: verifica se este pedido já existe ANTES do upsert
  // Protege contra retries do webhook reenviando email e notificação
  const { data: pedidoExistente } = await supabase
    .from("pedidos")
    .select("id")
    .eq("shopify_order_id", String(order.id))
    .single();

  const isPrimeiroPedido = !pedidoExistente;

  // Issue #1: exclui pedidos cancelados do acumulado para cálculo de tier correto
  const { data: pedidosDoMes } = await supabase
    .from("pedidos")
    .select("valor_total")
    .eq("afiliada_id", afiliada.id)
    .eq("mes_referencia", mes)
    .eq("cancelado", false)
    .neq("shopify_order_id", String(order.id));

  const totalAcumulado = (pedidosDoMes ?? []).reduce((s, p) => s + p.valor_total, 0);
  const novoTotal = totalAcumulado + valorTotal;

  // Busca tiers globais e determina qual se aplica ao novo total acumulado
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

  // Salva o pedido (upsert protege contra duplicatas de webhook)
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

  // Só notifica se for a primeira vez (não retry do webhook)
  if (isPrimeiroPedido) {
    if (afiliada.email) {
      enviarNotificacaoPedido(afiliada.email, afiliada.nome, valorTotal, comissao, mes, PORTAL_URL).catch(
        (e) => console.error("[webhook] Falha ao notificar afiliada:", e.message)
      );
    }

    // Issue #13: notifica o admin sobre nova venda
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      enviarNotificacaoAdmin(adminEmail, afiliada.nome, afiliada.cupom ?? "", valorTotal, comissao).catch(
        (e) => console.error("[webhook] Falha ao notificar admin:", e.message)
      );
    }
  }

  return new Response("ok", { status: 200 });
};
