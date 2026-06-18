import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link, Form, useSearchParams } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

function primeiroDiaMes(yyyymm: string) {
  return `${yyyymm}-01`;
}
function ultimoDiaMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${yyyymm}-${String(ultimo).padStart(2, "0")}`;
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { id } = params;
  const url = new URL(request.url);

  // Padrão: mês atual (dia 1 até hoje)
  const de = url.searchParams.get("de") || primeiroDiaMes(mesAtual());
  const ate = url.searchParams.get("ate") || hojeStr();
  // Mês de referência para pagamento = mês do início do período
  const mesPagamento = de.substring(0, 7);

  const { data: afiliada } = await supabase.from("afiliadas").select("*").eq("id", id).single();

  // Pedidos dentro do intervalo
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .eq("afiliada_id", id)
    .gte("criado_em", `${de}T00:00:00`)
    .lte("criado_em", `${ate}T23:59:59`)
    .order("criado_em", { ascending: false });

  // Pagamentos: todos os meses que caem dentro do range
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
    .select("*")
    .eq("afiliada_id", id)
    .in("mes_referencia", Array.from(mesesNoRange))
    .order("pago_em", { ascending: false });

  const pedidosFiltrados = pedidos ?? [];
  const pagamentosFiltrados = pagamentos ?? [];

  const totalComissao = pedidosFiltrados.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0);
  const totalPago = pagamentosFiltrados.reduce((s, p) => s + p.valor, 0);
  const aReceber = Math.max(0, totalComissao - totalPago);

  return { afiliada, pedidos: pedidosFiltrados, pagamentos: pagamentosFiltrados, aReceber, totalComissao, de, ate, mesPagamento };
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
const dateInput: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", background: "#fff" };

function fmtMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-");
  return new Date(Number(a), Number(m) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

export default function PainelAfiliadaDetalhe() {
  const { afiliada, pedidos, pagamentos, aReceber, totalComissao, de, ate, mesPagamento } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ sucesso?: string; erro?: string }>();
  const [searchParams] = useSearchParams();
  const [editando, setEditando] = useState(false);

  if (!afiliada) return <p>Afiliada não encontrada.</p>;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  const atalho = (label: string, deVal: string, ateVal: string) => (
    <a
      href={`?de=${deVal}&ate=${ateVal}`}
      style={{
        padding: "5px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
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
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <Link to="/painel/afiliadas" style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>← Afiliadas</Link>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>{afiliada.nome}</h1>
        <span style={{ background: "#111", color: "#fff", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{afiliada.cupom}</span>
        {!afiliada.ativo && <span style={{ background: "#fee2e2", color: "#e53e3e", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>INATIVA</span>}
      </div>

      {/* Filtro de período */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
        <Form method="get" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#666" }}>Período:</span>
          <input type="date" name="de" defaultValue={de} style={dateInput} />
          <span style={{ color: "#aaa", fontSize: "13px" }}>até</span>
          <input type="date" name="ate" defaultValue={ate} style={dateInput} />
          <button type="submit" style={{ padding: "7px 16px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
            Filtrar
          </button>
          <div style={{ display: "flex", gap: "6px", marginLeft: "4px" }}>
            {atalho("Este mês", primeiroDiaMes(mesAtual()), hojeStr())}
            {atalho("Mês passado", primeiroDiaMes(mesAnterior()), ultimoDiaMes(mesAnterior()))}
          </div>
        </Form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Sidebar */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Comissão gerada</p>
          <p style={{ margin: "0 0 16px", fontSize: "28px", fontWeight: "800", color: "#111" }}>{fmt(totalComissao)}</p>

          <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>A receber</p>
          <p style={{ margin: "0 0 16px", fontSize: "28px", fontWeight: "800", color: aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceber)}</p>

          {afiliada.pix && (
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#666", background: "#f9f9f9", padding: "10px 12px", borderRadius: "8px" }}>
              PIX: <strong>{afiliada.pix}</strong>
            </p>
          )}

          {aReceber > 0 && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <p style={{ margin: "0 0 4px", fontWeight: "700", fontSize: "14px" }}>Registrar pagamento</p>
              <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#999", textTransform: "capitalize" }}>
                ref. {fmtMes(mesPagamento)}
              </p>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="pagar" />
                <input type="hidden" name="mes" value={mesPagamento} />
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

        {/* Tabelas */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
                Pedidos
                <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>({pedidos.length})</span>
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Pedido", "Venda", "Comissão", "Data"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pedidos.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido neste período</td></tr>}
                {pedidos.map((p) => (
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
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Pagamentos registrados</h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f9f9f9" }}>
                {["Data", "Mês ref.", "Valor", "Observação"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pagamentos.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento neste período</td></tr>}
                {pagamentos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px", textTransform: "capitalize" }}>{fmtMes(p.mes_referencia)}</td>
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
