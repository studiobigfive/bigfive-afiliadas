import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const mes = mesAtual();

  const { data: afiliadas } = await supabase
    .from("afiliadas")
    .select("id, nome, cupom, pix")
    .eq("ativo", true)
    .order("nome");

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("afiliada_id, valor_total, comissao")
    .eq("mes_referencia", mes);

  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("afiliada_id, valor")
    .eq("mes_referencia", mes);

  const resumo = (afiliadas ?? []).map((a) => {
    const pedidosAfiliada = (pedidos ?? []).filter((p) => p.afiliada_id === a.id);
    const pagamentosAfiliada = (pagamentos ?? []).filter((p) => p.afiliada_id === a.id);
    const totalVendas = pedidosAfiliada.reduce((s, p) => s + p.valor_total, 0);
    const totalComissao = pedidosAfiliada.reduce((s, p) => s + p.comissao, 0);
    const totalPago = pagamentosAfiliada.reduce((s, p) => s + p.valor, 0);
    return {
      ...a,
      totalVendas,
      totalPedidos: pedidosAfiliada.length,
      totalComissao,
      aReceber: Math.max(0, totalComissao - totalPago),
    };
  });

  const totalDever = resumo.reduce((s, a) => s + a.aReceber, 0);

  return { resumo, totalDever, mes };
};

export default function Dashboard() {
  const { resumo, totalDever, mes } = useLoaderData<typeof loader>();
  const [ano, mesNum] = mes.split("-");
  const mesLabel = new Date(Number(ano), Number(mesNum) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <s-page heading={`Afiliadas — ${mesLabel}`}>
      <s-button slot="primary-action" variant="primary" url="/app/afiliadas">
        + Nova afiliada
      </s-button>

      <s-layout>
        <s-layout-section>
          <s-card>
            <s-box padding="400">
              <s-text variant="headingMd">Total a pagar este mês</s-text>
              <s-text variant="heading2xl" as="p">
                {totalDever.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </s-text>
              <s-text tone="subdued">Pagamentos até dia 10 do mês seguinte</s-text>
            </s-box>
          </s-card>
        </s-layout-section>

        <s-layout-section>
          <s-card>
            <s-data-table
              column-content-types='["text","text","numeric","numeric","numeric","text"]'
              headings='["Afiliada","Cupom","Pedidos","Vendas","Comissão","A receber"]'
              rows={JSON.stringify(
                resumo.map((a) => [
                  a.nome,
                  a.cupom,
                  a.totalPedidos,
                  a.totalVendas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                  a.totalComissao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                  a.aReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
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
