import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { id } = params;
  const { data: afiliada } = await supabase.from("afiliadas").select("*").eq("id", id).single();
  const { data: pedidos } = await supabase.from("pedidos").select("*").eq("afiliada_id", id).order("criado_em", { ascending: false });
  const { data: pagamentos } = await supabase.from("pagamentos").select("*").eq("afiliada_id", id).order("pago_em", { ascending: false });

  const mes = mesAtual();
  const pedidosMes = (pedidos ?? []).filter((p) => p.mes_referencia === mes);
  const pagamentosMes = (pagamentos ?? []).filter((p) => p.mes_referencia === mes);
  const totalComissaoMes = pedidosMes.reduce((s, p) => s + p.comissao, 0);
  const totalPagoMes = pagamentosMes.reduce((s, p) => s + p.valor, 0);
  const aReceber = Math.max(0, totalComissaoMes - totalPagoMes);

  return { afiliada, pedidos: pedidos ?? [], pagamentos: pagamentos ?? [], aReceber, mes };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await requireAuth(request);
  const { id } = params;
  const form = await request.formData();
  if (form.get("intent") === "pagar") {
    await supabase.from("pagamentos").insert({
      afiliada_id: id,
      valor: parseFloat(form.get("valor") as string),
      mes_referencia: form.get("mes"),
      observacao: form.get("observacao") || null,
    });
    return { sucesso: true };
  }
  return null;
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px 16px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", marginBottom: "8px" };

export default function PainelAfiliadaDetalhe() {
  const { afiliada, pedidos, pagamentos, aReceber, mes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  if (!afiliada) return <p>Afiliada não encontrada.</p>;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <Link to="/painel/afiliadas" style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>← Afiliadas</Link>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>{afiliada.nome}</h1>
        <span style={{ background: "#111", color: "#fff", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{afiliada.cupom}</span>
        {!afiliada.ativo && <span style={{ background: "#fee2e2", color: "#e53e3e", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>INATIVA</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>A receber este mês</p>
          <p style={{ margin: "0 0 16px", fontSize: "32px", fontWeight: "800", color: aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceber)}</p>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#666", background: "#f9f9f9", padding: "10px 12px", borderRadius: "8px" }}>
            Comissão: <strong style={{ color: "#00C9A7" }}>{afiliada.percentual_comissao ?? 10}% por venda</strong>
          </p>
          {afiliada.pix && (
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#666", background: "#f9f9f9", padding: "10px 12px", borderRadius: "8px" }}>
              PIX: <strong>{afiliada.pix}</strong>
            </p>
          )}

          {aReceber > 0 && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <p style={{ margin: "0 0 12px", fontWeight: "700", fontSize: "14px" }}>Registrar pagamento</p>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="pagar" />
                <input type="hidden" name="mes" value={mes} />
                <input type="number" name="valor" defaultValue={aReceber} step="0.01" style={inputStyle} />
                <input type="text" name="observacao" placeholder="Observação (opcional)" style={inputStyle} />
                <button type="submit" style={{ width: "100%", padding: "12px", background: "#38a169", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}>
                  ✓ Marcar como pago
                </button>
              </fetcher.Form>
            </div>
          )}
        </div>

        {/* Tables */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Pedidos com cupom ({pedidos.length})</h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Pedido", "Mês", "Venda", "Comissão"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pedidos.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido ainda</td></tr>}
                {pedidos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, fontWeight: "600" }}>#{p.shopify_order_id}</td>
                    <td style={{ ...td, color: "#666" }}>{p.mes_referencia}</td>
                    <td style={{ ...td, color: "#666" }}>{fmt(p.valor_total)}</td>
                    <td style={{ ...td, fontWeight: "700", color: "#38a169" }}>{fmt(p.comissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Histórico de pagamentos</h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Data", "Mês", "Valor", "Observação"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pagamentos.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento registrado</td></tr>}
                {pagamentos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, color: "#666" }}>{new Date(p.pago_em).toLocaleDateString("pt-BR")}</td>
                    <td style={{ ...td, color: "#666" }}>{p.mes_referencia}</td>
                    <td style={{ ...td, fontWeight: "700", color: "#38a169" }}>{fmt(p.valor)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px" }}>{p.observacao || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
