import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

const round2 = (v: number) => Math.round(v * 100) / 100;

function deslocarMes(mes: string, delta: number): string {
  const [ano, num] = mes.split("-").map(Number);
  const d = new Date(ano, num - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const url = new URL(request.url);
  const mesParam = url.searchParams.get("mes");
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual();

  // ── Afiliadas ──────────────────────────────────────────────────────────────
  const { data: afiliadas } = await supabase
    .from("afiliadas")
    .select("id, nome, cupom, pix, instagram")
    .eq("ativo", true)
    .order("nome");
  // Exclui cancelados para não inflar o "a receber" (consistente com a tela de detalhe)
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("afiliada_id, valor_total, comissao")
    .eq("mes_referencia", mes)
    .eq("cancelado", false);
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("afiliada_id, valor")
    .eq("mes_referencia", mes);

  const resumo = (afiliadas ?? []).map((a) => {
    const pedidosA = (pedidos ?? []).filter((p) => p.afiliada_id === a.id);
    const pagamentosA = (pagamentos ?? []).filter((p) => p.afiliada_id === a.id);
    const totalVendas = round2(pedidosA.reduce((s, p) => s + p.valor_total, 0));
    const totalComissao = round2(pedidosA.reduce((s, p) => s + p.comissao, 0));
    const totalPago = round2(pagamentosA.reduce((s, p) => s + p.valor, 0));
    return { ...a, totalVendas, totalPedidos: pedidosA.length, totalComissao, aReceber: Math.max(0, round2(totalComissao - totalPago)) };
  });

  // ── Designers ───────────────────────────────────────────────────────────────
  const { data: designers } = await supabase
    .from("designers")
    .select("id, nome, cupom, instagram, percentual")
    .eq("ativo", true)
    .order("nome");
  const { data: pedidosDesigner } = await supabase
    .from("pedidos_designer")
    .select("designer_id, valor_item, comissao")
    .eq("mes_referencia", mes)
    .eq("cancelado", false);
  const { data: pagamentosDesigner } = await supabase
    .from("pagamentos_designer")
    .select("designer_id, valor")
    .eq("mes_referencia", mes);

  const resumoDesigners = (designers ?? []).map((d) => {
    const pd = (pedidosDesigner ?? []).filter((p) => p.designer_id === d.id);
    const pg = (pagamentosDesigner ?? []).filter((p) => p.designer_id === d.id);
    const totalVendas = round2(pd.reduce((s, p) => s + (p.valor_item ?? 0), 0));
    const totalComissao = round2(pd.reduce((s, p) => s + (p.comissao ?? 0), 0));
    const totalPago = round2(pg.reduce((s, p) => s + (p.valor ?? 0), 0));
    return { ...d, totalDesigns: pd.length, totalVendas, totalComissao, aReceber: Math.max(0, round2(totalComissao - totalPago)) };
  });

  const deverAfiliadas = round2(resumo.reduce((s, a) => s + a.aReceber, 0));
  const deverDesigners = round2(resumoDesigners.reduce((s, d) => s + d.aReceber, 0));
  const totalDever = round2(deverAfiliadas + deverDesigners);

  return {
    resumo, resumoDesigners, deverAfiliadas, deverDesigners, totalDever, mes,
    mesAnterior: deslocarMes(mes, -1),
    mesSeguinte: deslocarMes(mes, 1),
    ehMesAtual: mes === mesAtual(),
  };
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" };
const td: React.CSSProperties = { padding: "14px 16px" };

export default function PainelIndex() {
  const { resumo, resumoDesigners, deverAfiliadas, deverDesigners, totalDever, mes, mesAnterior, mesSeguinte, ehMesAtual } = useLoaderData<typeof loader>();
  const [ano, mesNum] = mes.split("-");
  const mesLabel = new Date(Number(ano), Number(mesNum) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            to={`/painel?mes=${mesAnterior}`}
            style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #ddd", borderRadius: "8px", color: "#555", textDecoration: "none", fontSize: "14px", background: "#fff" }}
          >
            ←
          </Link>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "700", textTransform: "capitalize" }}>Dashboard — {mesLabel}</h1>
          {!ehMesAtual && (
            <Link
              to={`/painel?mes=${mesSeguinte}`}
              style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #ddd", borderRadius: "8px", color: "#555", textDecoration: "none", fontSize: "14px", background: "#fff" }}
            >
              →
            </Link>
          )}
          {!ehMesAtual && (
            <Link to="/painel" style={{ fontSize: "13px", color: "#00C9A7", textDecoration: "none", fontWeight: "600" }}>
              Voltar ao mês atual
            </Link>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/painel/visualizacao" style={{ background: "#fff", color: "#555", padding: "10px 18px", borderRadius: "8px", textDecoration: "none", fontWeight: "600", fontSize: "14px", border: "1px solid #ddd" }}>
            👁 Visualização do parceiro
          </Link>
          <Link to="/painel/influencers" style={{ background: "#111", color: "#fff", padding: "10px 18px", borderRadius: "8px", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>
            + Influencer
          </Link>
          <Link to="/painel/designers" style={{ background: "#00C9A7", color: "#fff", padding: "10px 18px", borderRadius: "8px", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>
            + Designer
          </Link>
        </div>
      </div>

      {/* Total combinado a pagar */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", marginBottom: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total a pagar {ehMesAtual ? "este mês" : "nesse mês"}</p>
        <p style={{ margin: "0 0 8px", fontSize: "38px", fontWeight: "800", color: totalDever > 0 ? "#e53e3e" : "#111" }}>{fmt(totalDever)}</p>
        <div style={{ display: "flex", gap: "20px", fontSize: "13px", color: "#666" }}>
          <span>Influencers: <strong style={{ color: "#444" }}>{fmt(deverAfiliadas)}</strong></span>
          <span style={{ color: "#ddd" }}>·</span>
          <span>Designers: <strong style={{ color: "#444" }}>{fmt(deverDesigners)}</strong></span>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#999" }}>Pagamentos até dia 10 do mês seguinte</p>
      </div>

      {/* Influencers */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Influencers <span style={{ color: "#aaa", fontWeight: "400", fontSize: "13px" }}>({resumo.length})</span></h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Influencer", "Cupom", "Pedidos", "Vendas", "Comissão", "A receber", ""].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumo.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhuma influencer ativa ainda</td></tr>
            )}
            {resumo.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ ...td, fontWeight: "600" }}>
                  {a.nome}
                  {a.instagram && <div style={{ fontSize: "12px", color: "#00C9A7", fontWeight: "500" }}>@{a.instagram}</div>}
                </td>
                <td style={td}><span style={{ background: "#111", color: "#fff", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{a.cupom}</span></td>
                <td style={{ ...td, color: "#666" }}>{a.totalPedidos}</td>
                <td style={{ ...td, color: "#666" }}>{fmt(a.totalVendas)}</td>
                <td style={{ ...td, color: "#666" }}>{fmt(a.totalComissao)}</td>
                <td style={{ ...td, fontWeight: "700", color: a.aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(a.aReceber)}</td>
                <td style={td}><Link to={`/painel/influencer/${a.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>Ver →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Designers */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Designers <span style={{ color: "#aaa", fontWeight: "400", fontSize: "13px" }}>({resumoDesigners.length})</span></h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Designer", "Cupom", "Designs", "Vendas", "Comissão", "A receber", ""].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumoDesigners.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum designer ativo ainda</td></tr>
            )}
            {resumoDesigners.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ ...td, fontWeight: "600" }}>
                  {d.nome}
                  {d.instagram && <div style={{ fontSize: "12px", color: "#00C9A7", fontWeight: "500" }}>@{d.instagram}</div>}
                </td>
                <td style={td}>
                  {d.cupom
                    ? <span style={{ background: "#111", color: "#fff", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{d.cupom}</span>
                    : <span style={{ color: "#ccc" }}>—</span>}
                </td>
                <td style={{ ...td, color: "#666" }}>{d.totalDesigns}</td>
                <td style={{ ...td, color: "#666" }}>{fmt(d.totalVendas)}</td>
                <td style={{ ...td, color: "#666" }}>{fmt(d.totalComissao)}</td>
                <td style={{ ...td, fontWeight: "700", color: d.aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(d.aReceber)}</td>
                <td style={td}><Link to={`/painel/designer/${d.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>Ver →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
