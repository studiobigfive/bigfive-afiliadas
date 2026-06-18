import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Form } from "react-router";
import { requireAfiliadaAuth } from "../lib/afiliada.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const afiliadaId = await requireAfiliadaAuth(request);
  const url = new URL(request.url);
  const mes = url.searchParams.get("mes") || mesAtual();

  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("nome, cupom, pix")
    .eq("id", afiliadaId)
    .single();

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("shopify_order_id, mes_referencia, valor_total, comissao, criado_em")
    .eq("afiliada_id", afiliadaId)
    .order("criado_em", { ascending: false });

  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("valor, mes_referencia, observacao, pago_em")
    .eq("afiliada_id", afiliadaId)
    .order("pago_em", { ascending: false });

  // Monta lista de meses disponíveis (do mais recente ao mais antigo)
  const todosMeses = new Set<string>([mesAtual()]);
  (pedidos ?? []).forEach((p) => todosMeses.add(p.mes_referencia));
  (pagamentos ?? []).forEach((p) => todosMeses.add(p.mes_referencia));
  const mesesDisponiveis = Array.from(todosMeses).sort().reverse();

  const pedidosMes = (pedidos ?? []).filter((p) => p.mes_referencia === mes);
  const totalComissaoMes = pedidosMes.reduce((s, p) => s + p.comissao, 0);
  const totalPagoMes = (pagamentos ?? [])
    .filter((p) => p.mes_referencia === mes)
    .reduce((s, p) => s + p.valor, 0);
  const aReceberMes = Math.max(0, totalComissaoMes - totalPagoMes);
  const pagamentosMes = (pagamentos ?? []).filter((p) => p.mes_referencia === mes);

  return {
    afiliada,
    pedidosMes,
    pagamentosMes,
    aReceberMes,
    totalComissaoMes,
    mes,
    mesesDisponiveis,
  };
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" };
const td: React.CSSProperties = { padding: "14px 16px", fontSize: "14px" };

function mesLabel(m: string) {
  const [ano, num] = m.split("-");
  return new Date(Number(ano), Number(num) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

export default function AfiliadaDashboard() {
  const { afiliada, pedidosMes, pagamentosMes, aReceberMes, totalComissaoMes, mes, mesesDisponiveis } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <>
      {/* Boas-vindas */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "700" }}>Olá, {afiliada?.nome}!</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ background: "#111", color: "#fff", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "2px" }}>{afiliada?.cupom}</span>
          {afiliada?.pix && (
            <span style={{ fontSize: "13px", color: "#888" }}>PIX: <strong style={{ color: "#444" }}>{afiliada.pix}</strong></span>
          )}
        </div>
      </div>

      {/* Seletor de mês */}
      <div style={{ marginBottom: "20px" }}>
        <Form method="get" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "13px", fontWeight: "600", color: "#666" }}>Mês:</label>
          <select
            name="mes"
            defaultValue={mes}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", fontWeight: "600", background: "#fff", cursor: "pointer" }}
          >
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m} style={{ textTransform: "capitalize" }}>
                {mesLabel(m)}
              </option>
            ))}
          </select>
        </Form>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Comissão gerada
          </p>
          <p style={{ margin: 0, fontSize: "30px", fontWeight: "800", color: "#111" }}>{fmt(totalComissaoMes)}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>A receber</p>
          <p style={{ margin: 0, fontSize: "30px", fontWeight: "800", color: aReceberMes > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceberMes)}</p>
        </div>
      </div>

      {/* Pedidos do mês selecionado */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
            Pedidos — <span style={{ fontWeight: "400", color: "#888", textTransform: "capitalize" }}>{mesLabel(mes)}</span>
            <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>({pedidosMes.length})</span>
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Pedido", "Venda", "Comissão", "Data"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pedidosMes.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido neste mês</td></tr>
            )}
            {pedidosMes.map((p) => (
              <tr key={p.shopify_order_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ ...td, fontWeight: "600" }}>#{p.shopify_order_id}</td>
                <td style={{ ...td, color: "#666" }}>{fmt(p.valor_total)}</td>
                <td style={{ ...td, fontWeight: "700", color: "#00C9A7" }}>{fmt(p.comissao)}</td>
                <td style={{ ...td, color: "#888", fontSize: "13px" }}>{fmtDate(p.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagamentos do mês selecionado */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
            Pagamentos recebidos — <span style={{ fontWeight: "400", color: "#888", textTransform: "capitalize" }}>{mesLabel(mes)}</span>
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Data", "Valor", "Observação"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagamentosMes.length === 0 && (
              <tr><td colSpan={3} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento neste mês</td></tr>
            )}
            {pagamentosMes.map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
                <td style={{ ...td, fontWeight: "700", color: "#38a169" }}>{fmt(p.valor)}</td>
                <td style={{ ...td, color: "#888", fontSize: "13px" }}>{p.observacao || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
