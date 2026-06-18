import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link, Form } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { id } = params;
  const url = new URL(request.url);
  const mes = url.searchParams.get("mes") || mesAtual();

  const { data: afiliada } = await supabase.from("afiliadas").select("*").eq("id", id).single();
  const { data: pedidos } = await supabase.from("pedidos").select("*").eq("afiliada_id", id).order("criado_em", { ascending: false });
  const { data: pagamentos } = await supabase.from("pagamentos").select("*").eq("afiliada_id", id).order("pago_em", { ascending: false });

  // Meses disponíveis baseado nos dados
  const todosMeses = new Set<string>([mesAtual()]);
  (pedidos ?? []).forEach((p) => todosMeses.add(p.mes_referencia));
  (pagamentos ?? []).forEach((p) => todosMeses.add(p.mes_referencia));
  const mesesDisponiveis = Array.from(todosMeses).sort().reverse();

  const pedidosMes = (pedidos ?? []).filter((p) => p.mes_referencia === mes);
  const pagamentosMes = (pagamentos ?? []).filter((p) => p.mes_referencia === mes);
  // Exclui cancelados do total de comissão
  const totalComissaoMes = pedidosMes.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0);
  const totalPagoMes = pagamentosMes.reduce((s, p) => s + p.valor, 0);
  const aReceber = Math.max(0, totalComissaoMes - totalPagoMes);

  return { afiliada, pedidosMes, pagamentosMes, aReceber, totalComissaoMes, mes, mesesDisponiveis };
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
    return { sucesso: "pago" };
  }

  if (form.get("intent") === "editar") {
    const { error } = await supabase.from("afiliadas").update({
      nome: form.get("nome"),
      email: form.get("email"),
      pix: form.get("pix") || null,
    }).eq("id", id);
    if (error) return { erro: error.message };
    return { sucesso: "editado" };
  }

  return null;
};

const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px 16px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", marginBottom: "8px" };

function mesLabel(m: string) {
  const [ano, num] = m.split("-");
  return new Date(Number(ano), Number(num) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

export default function PainelAfiliadaDetalhe() {
  const { afiliada, pedidosMes, pagamentosMes, aReceber, totalComissaoMes, mes, mesesDisponiveis } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ sucesso?: string; erro?: string }>();
  const [editando, setEditando] = useState(false);

  if (!afiliada) return <p>Afiliada não encontrada.</p>;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
  const ehMesAtual = mes === mesAtual();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <Link to="/painel/afiliadas" style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>← Afiliadas</Link>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>{afiliada.nome}</h1>
        <span style={{ background: "#111", color: "#fff", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{afiliada.cupom}</span>
        {!afiliada.ativo && <span style={{ background: "#fee2e2", color: "#e53e3e", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>INATIVA</span>}
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
              <option key={m} value={m}>
                {mesLabel(m)}{m === mesAtual() ? " (atual)" : ""}
              </option>
            ))}
          </select>
        </Form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Comissão gerada
          </p>
          <p style={{ margin: "0 0 16px", fontSize: "28px", fontWeight: "800", color: "#111" }}>{fmt(totalComissaoMes)}</p>

          <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>A receber</p>
          <p style={{ margin: "0 0 16px", fontSize: "28px", fontWeight: "800", color: aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceber)}</p>

          {afiliada.pix && (
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#666", background: "#f9f9f9", padding: "10px 12px", borderRadius: "8px" }}>
              PIX: <strong>{afiliada.pix}</strong>
            </p>
          )}

          {aReceber > 0 && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <p style={{ margin: "0 0 4px", fontWeight: "700", fontSize: "14px" }}>Registrar pagamento</p>
              <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#999", textTransform: "capitalize" }}>{mesLabel(mes)}</p>
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

          {/* Editar dados */}
          <div style={{ borderTop: "1px solid #eee", paddingTop: "20px", marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#00C9A7", fontWeight: "600", fontSize: "13px" }}
            >
              {editando ? "✕ Cancelar" : "✎ Editar dados"}
            </button>

            {editando && (
              <fetcher.Form method="post" style={{ marginTop: "14px" }} onSubmit={() => setEditando(false)}>
                <input type="hidden" name="intent" value="editar" />
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>Nome</label>
                <input name="nome" required defaultValue={afiliada.nome} style={inputStyle} />
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>E-mail</label>
                <input name="email" type="email" required defaultValue={afiliada.email} style={inputStyle} />
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>Chave PIX</label>
                <input name="pix" defaultValue={afiliada.pix ?? ""} placeholder="CPF, e-mail ou telefone" style={inputStyle} />
                {fetcher.data?.erro && (
                  <p style={{ color: "#e53e3e", fontSize: "12px", margin: "4px 0" }}>{fetcher.data.erro}</p>
                )}
                <button type="submit" style={{ width: "100%", padding: "10px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "13px" }}>
                  Salvar alterações
                </button>
              </fetcher.Form>
            )}

            {fetcher.data?.sucesso === "editado" && !editando && (
              <p style={{ color: "#38a169", fontSize: "12px", marginTop: "8px", fontWeight: "600" }}>✓ Dados atualizados</p>
            )}
          </div>
        </div>

        {/* Tables */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
                Pedidos — <span style={{ fontWeight: "400", color: "#888", textTransform: "capitalize" }}>{mesLabel(mes)}</span>
                <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>({pedidosMes.length})</span>
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Pedido", "Venda", "Comissão", "Data"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pedidosMes.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido neste mês</td></tr>}
                {pedidosMes.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5", opacity: p.cancelado ? 0.5 : 1 }}>
                    <td style={{ ...td, fontWeight: "600" }}>
                      #{p.shopify_order_id}
                      {p.cancelado && <span style={{ marginLeft: "6px", background: "#fee2e2", color: "#e53e3e", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>CANCELADO</span>}
                    </td>
                    <td style={{ ...td, color: "#666" }}>{fmt(p.valor_total)}</td>
                    <td style={{ ...td, fontWeight: "700", color: p.cancelado ? "#ccc" : "#38a169" }}>
                      {p.cancelado ? <s>{fmt(p.comissao)}</s> : fmt(p.comissao)}
                    </td>
                    <td style={{ ...td, color: "#888", fontSize: "13px" }}>{fmtDate(p.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
                Pagamentos — <span style={{ fontWeight: "400", color: "#888", textTransform: "capitalize" }}>{mesLabel(mes)}</span>
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Data", "Valor", "Observação"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pagamentosMes.length === 0 && <tr><td colSpan={3} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento neste mês</td></tr>}
                {pagamentosMes.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
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
