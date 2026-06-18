import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { requireAfiliadaAuth } from "../lib/afiliada.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

function primeiroDiaMes(yyyymm: string) {
  return `${yyyymm}-01`;
}
function ultimoDiaMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-").map(Number);
  return `${yyyymm}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}
function mesAnterior() {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}
function hojeStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const afiliadaId = await requireAfiliadaAuth(request);
  const url = new URL(request.url);

  const de = url.searchParams.get("de") || primeiroDiaMes(mesAtual());
  const ate = url.searchParams.get("ate") || hojeStr();

  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("nome, cupom, pix")
    .eq("id", afiliadaId)
    .single();

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("shopify_order_id, mes_referencia, valor_total, comissao, criado_em, cancelado")
    .eq("afiliada_id", afiliadaId)
    .gte("criado_em", `${de}T00:00:00`)
    .lte("criado_em", `${ate}T23:59:59`)
    .order("criado_em", { ascending: false });

  // Pagamentos dos meses que caem no range
  const mesesNoRange = new Set<string>();
  const deDate = new Date(de);
  const ateDate = new Date(ate);
  const cur = new Date(deDate.getFullYear(), deDate.getMonth(), 1);
  while (cur <= ateDate) {
    mesesNoRange.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("valor, mes_referencia, observacao, pago_em")
    .eq("afiliada_id", afiliadaId)
    .in("mes_referencia", Array.from(mesesNoRange))
    .order("pago_em", { ascending: false });

  const pedidosFiltrados = pedidos ?? [];
  const pagamentosFiltrados = pagamentos ?? [];

  const totalComissao = pedidosFiltrados.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0);
  const totalPago = pagamentosFiltrados.reduce((s, p) => s + p.valor, 0);
  const aReceber = Math.max(0, totalComissao - totalPago);

  return { afiliada, pedidos: pedidosFiltrados, pagamentos: pagamentosFiltrados, totalComissao, aReceber, de, ate };
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" };
const td: React.CSSProperties = { padding: "14px 16px", fontSize: "14px" };
const dateInput: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", background: "#fff" };

function fmtMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-");
  return new Date(Number(a), Number(m) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

export default function AfiliadaDashboard() {
  const { afiliada, pedidos, pagamentos, totalComissao, aReceber, de, ate } = useLoaderData<typeof loader>();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  const atalho = (label: string, deVal: string, ateVal: string) => (
    <a
      href={`?de=${deVal}&ate=${ateVal}`}
      style={{
        padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
        textDecoration: "none", border: "1px solid #ddd",
        background: de === deVal && ate === ateVal ? "#111" : "#fff",
        color: de === deVal && ate === ateVal ? "#fff" : "#555",
      }}
    >
      {label}
    </a>
  );

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

      {/* Filtro de período */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "14px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
        <Form method="get" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#666" }}>Período:</span>
          <input type="date" name="de" defaultValue={de} style={dateInput} />
          <span style={{ color: "#aaa", fontSize: "13px" }}>até</span>
          <input type="date" name="ate" defaultValue={ate} style={dateInput} />
          <button type="submit" style={{ padding: "7px 16px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
            Filtrar
          </button>
          <div style={{ display: "flex", gap: "6px" }}>
            {atalho("Este mês", primeiroDiaMes(mesAtual()), hojeStr())}
            {atalho("Mês passado", primeiroDiaMes(mesAnterior()), ultimoDiaMes(mesAnterior()))}
          </div>
        </Form>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Comissão gerada</p>
          <p style={{ margin: 0, fontSize: "30px", fontWeight: "800", color: "#111" }}>{fmt(totalComissao)}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>A receber</p>
          <p style={{ margin: 0, fontSize: "30px", fontWeight: "800", color: aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceber)}</p>
        </div>
      </div>

      {/* Pedidos */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
            Pedidos
            <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>({pedidos.length})</span>
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Pedido", "Venda", "Comissão", "Data"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido neste período</td></tr>
            )}
            {pedidos.map((p) => (
              <tr key={p.shopify_order_id} style={{ borderBottom: "1px solid #f5f5f5", opacity: p.cancelado ? 0.5 : 1 }}>
                <td style={{ ...td, fontWeight: "600" }}>
                  #{p.shopify_order_id}
                  {p.cancelado && <span style={{ marginLeft: "6px", background: "#fee2e2", color: "#e53e3e", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>CANCELADO</span>}
                </td>
                <td style={{ ...td, color: "#666" }}>{fmt(p.valor_total)}</td>
                <td style={{ ...td, fontWeight: "700", color: p.cancelado ? "#ccc" : "#00C9A7" }}>
                  {p.cancelado ? <s>{fmt(p.comissao)}</s> : fmt(p.comissao)}
                </td>
                <td style={{ ...td, color: "#888", fontSize: "13px" }}>{fmtDate(p.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagamentos */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Pagamentos recebidos</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Data", "Mês ref.", "Valor", "Observação"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagamentos.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento neste período</td></tr>
            )}
            {pagamentos.map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
                <td style={{ ...td, color: "#888", fontSize: "13px", textTransform: "capitalize" }}>{fmtMes(p.mes_referencia)}</td>
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
