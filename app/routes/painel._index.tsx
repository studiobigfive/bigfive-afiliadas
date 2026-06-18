import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const mes = mesAtual();

  const { data: afiliadas } = await supabase.from("afiliadas").select("id, nome, cupom, pix, instagram").eq("ativo", true).order("nome");
  const { data: pedidos } = await supabase.from("pedidos").select("afiliada_id, valor_total, comissao").eq("mes_referencia", mes);
  const { data: pagamentos } = await supabase.from("pagamentos").select("afiliada_id, valor").eq("mes_referencia", mes);

  const resumo = (afiliadas ?? []).map((a) => {
    const pedidosA = (pedidos ?? []).filter((p) => p.afiliada_id === a.id);
    const pagamentosA = (pagamentos ?? []).filter((p) => p.afiliada_id === a.id);
    const totalVendas = pedidosA.reduce((s, p) => s + p.valor_total, 0);
    const totalComissao = pedidosA.reduce((s, p) => s + p.comissao, 0);
    const totalPago = pagamentosA.reduce((s, p) => s + p.valor, 0);
    return { ...a, totalVendas, totalPedidos: pedidosA.length, totalComissao, aReceber: Math.max(0, totalComissao - totalPago) };
  });

  const totalDever = resumo.reduce((s, a) => s + a.aReceber, 0);
  return { resumo, totalDever, mes };
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" };
const td: React.CSSProperties = { padding: "14px 16px" };

export default function PainelIndex() {
  const { resumo, totalDever, mes } = useLoaderData<typeof loader>();
  const [ano, mesNum] = mes.split("-");
  const mesLabel = new Date(Number(ano), Number(mesNum) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "700", textTransform: "capitalize" }}>Participantes — {mesLabel}</h1>
        <Link to="/painel/afiliadas" style={{ background: "#111", color: "#fff", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>
          + Novo participante
        </Link>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", marginBottom: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total a pagar este mês</p>
        <p style={{ margin: "0 0 4px", fontSize: "38px", fontWeight: "800", color: totalDever > 0 ? "#e53e3e" : "#111" }}>{fmt(totalDever)}</p>
        <p style={{ margin: 0, fontSize: "13px", color: "#999" }}>Pagamentos até dia 10 do mês seguinte</p>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
              {["Participante", "Cupom", "Pedidos", "Vendas", "Comissão", "A receber", ""].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumo.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum participante ativo ainda</td></tr>
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
                <td style={td}><Link to={`/painel/afiliada/${a.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>Ver →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
