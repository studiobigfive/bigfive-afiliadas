import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const { id } = params;

  const { data: afiliada } = await supabase
    .from("afiliadas").select("*").eq("id", id).single();

  const { data: pedidos } = await supabase
    .from("pedidos").select("*").eq("afiliada_id", id).order("criado_em", { ascending: false });

  const { data: pagamentos } = await supabase
    .from("pagamentos").select("*").eq("afiliada_id", id).order("pago_em", { ascending: false });

  const mes = mesAtual();
  const pedidosMes = (pedidos ?? []).filter((p) => p.mes_referencia === mes);
  const pagamentosMes = (pagamentos ?? []).filter((p) => p.mes_referencia === mes);
  const totalComissaoMes = pedidosMes.reduce((s, p) => s + p.comissao, 0);
  const totalPagoMes = pagamentosMes.reduce((s, p) => s + p.valor, 0);
  const aReceber = Math.max(0, totalComissaoMes - totalPagoMes);

  return { afiliada, pedidos: pedidos ?? [], pagamentos: pagamentos ?? [], aReceber, mes };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const { id } = params;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "pagar") {
    const mes = form.get("mes") as string;
    const valor = parseFloat(form.get("valor") as string);
    await supabase.from("pagamentos").insert({
      afiliada_id: id,
      valor,
      mes_referencia: mes,
      observacao: form.get("observacao") || null,
    });
    return { sucesso: true };
  }

  return null;
};

export default function AfiliadaDetalhe() {
  const { afiliada, pedidos, pagamentos, aReceber, mes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  if (!afiliada) return <s-page heading="Afiliada não encontrada" />;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <s-page heading={afiliada.nome} back-action='{"url":"/app/afiliadas","content":"Afiliadas"}'>

      <s-layout>
        {/* Resumo */}
        <s-layout-section variant="oneThird">
          <s-card>
            <s-box padding="400">
              <s-block-stack gap="300">
                <s-text variant="headingMd">Resumo do mês</s-text>
                <s-text>Cupom: <strong>{afiliada.cupom}</strong></s-text>
                <s-text>PIX: {afiliada.pix || "—"}</s-text>
                <s-divider />
                <s-text variant="headingLg">A receber: {fmt(aReceber)}</s-text>

                {aReceber > 0 && (
                  <>
                    <s-text variant="headingMd" as="h3">Registrar pagamento</s-text>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="pagar" />
                      <input type="hidden" name="mes" value={mes} />
                      <s-form-layout>
                        <s-text-field
                          label="Valor pago (R$)"
                          name="valor"
                          type="number"
                          value={String(aReceber)}
                          step="0.01"
                        />
                        <s-text-field label="Observação (opcional)" name="observacao" />
                        <s-button submit variant="primary" tone="success">
                          Marcar como pago ✓
                        </s-button>
                      </s-form-layout>
                    </fetcher.Form>
                  </>
                )}
              </s-block-stack>
            </s-box>
          </s-card>
        </s-layout-section>

        {/* Pedidos */}
        <s-layout-section>
          <s-card>
            <s-box padding="400">
              <s-text variant="headingMd">Pedidos gerados pelo cupom</s-text>
            </s-box>
            <s-data-table
              column-content-types='["text","text","numeric","numeric"]'
              headings='["Pedido Shopify","Mês","Venda","Comissão"]'
              rows={JSON.stringify(
                pedidos.map((p) => [
                  `#${p.shopify_order_id}`,
                  p.mes_referencia,
                  fmt(p.valor_total),
                  fmt(p.comissao),
                ])
              )}
            />
          </s-card>

          <s-card>
            <s-box padding="400">
              <s-text variant="headingMd">Histórico de pagamentos</s-text>
            </s-box>
            <s-data-table
              column-content-types='["text","text","numeric"]'
              headings='["Data","Mês","Valor"]'
              rows={JSON.stringify(
                pagamentos.map((p) => [
                  new Date(p.pago_em).toLocaleDateString("pt-BR"),
                  p.mes_referencia,
                  fmt(p.valor),
                ])
              )}
            />
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
