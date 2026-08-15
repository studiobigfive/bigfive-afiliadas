import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { requireDesignerAuth } from "../lib/designer.auth.server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

function primeiroDiaMes(yyyymm: string) {
  return `${yyyymm}-01`;
}
function ultimoDiaMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-").map(Number);
  return `${yyyymm}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}
function deslocarMes(yyyymm: string, delta: number): string {
  const [a, m] = yyyymm.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function hojeStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function labelMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-").map(Number);
  return new Date(a, m - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}
function mesesRecentes() {
  const atual = mesAtual();
  return [0, -1, -2].map((delta) => {
    const mes = deslocarMes(atual, delta);
    return {
      mes,
      label: delta === 0 ? `${labelMes(mes)} (atual)` : labelMes(mes),
      de: primeiroDiaMes(mes),
      ate: delta === 0 ? hojeStr() : ultimoDiaMes(mes),
    };
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const designerId = await requireDesignerAuth(request);
  const url = new URL(request.url);

  const deRaw = url.searchParams.get("de") || primeiroDiaMes(mesAtual());
  const ateRaw = url.searchParams.get("ate") || hojeStr();
  const de = deRaw <= ateRaw ? deRaw : ateRaw;
  const ate = deRaw <= ateRaw ? ateRaw : deRaw;

  const { data: designer } = await supabase
    .from("designers")
    .select("nome, percentual")
    .eq("id", designerId)
    .single();

  const { data: pedidos } = await supabase
    .from("pedidos_designer")
    .select("shopify_order_id, numero_pedido, nome_produto, mes_referencia, valor_item, comissao, criado_em, cancelado")
    .eq("designer_id", designerId)
    .gte("criado_em", `${de}T00:00:00`)
    .lte("criado_em", `${ate}T23:59:59`)
    .order("criado_em", { ascending: false })
    .limit(100);

  const mesesNoRange = new Set<string>();
  const deDate = new Date(de);
  const ateDate = new Date(ate);
  const cur = new Date(deDate.getFullYear(), deDate.getMonth(), 1);
  while (cur <= ateDate) {
    mesesNoRange.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  const { data: pagamentos } = await supabase
    .from("pagamentos_designer")
    .select("valor, mes_referencia, observacao, pago_em")
    .eq("designer_id", designerId)
    .in("mes_referencia", Array.from(mesesNoRange))
    .order("pago_em", { ascending: false });

  const pedidosFiltrados = pedidos ?? [];
  const pagamentosFiltrados = pagamentos ?? [];

  const totalComissao = Math.round(pedidosFiltrados.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0) * 100) / 100;
  const totalPago = Math.round(pagamentosFiltrados.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const aReceber = Math.max(0, Math.round((totalComissao - totalPago) * 100) / 100);

  return { designer, pedidos: pedidosFiltrados, pagamentos: pagamentosFiltrados, totalComissao, aReceber, de, ate, truncated: pedidosFiltrados.length === 100 };
};

const th: React.CSSProperties = { padding: "10px 8px", textAlign: "left", fontSize: "12px", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" };
const td: React.CSSProperties = { padding: "14px 8px", fontSize: "14px" };
const dateInput: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", background: "#fff" };

function fmtMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-");
  return new Date(Number(a), Number(m) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

const paginaOpcoes = [5, 10, 25, 50];

export default function DesignerDashboard() {
  const { designer, pedidos, pagamentos, totalComissao, aReceber, de, ate, truncated } = useLoaderData<typeof loader>();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
  const fmtDateTime = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const [busca, setBusca] = useState("");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);

  const pedidosFiltrados = busca.trim()
    ? pedidos.filter((p) => {
        const termo = busca.trim().toLowerCase();
        return String(p.shopify_order_id).toLowerCase().includes(termo) || (p.numero_pedido ?? "").toLowerCase().includes(termo) || (p.nome_produto ?? "").toLowerCase().includes(termo);
      })
    : pedidos;

  const totalPaginas = Math.max(1, Math.ceil(pedidosFiltrados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pedidosPagina = pedidosFiltrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const totalVendas = pedidos.filter((p) => !p.cancelado).reduce((s, p) => s + p.valor_item, 0);
  const percentualEfetivo = totalVendas > 0 ? Math.round((totalComissao / totalVendas) * 1000) / 10 : 0;

  const exportarCSV = () => {
    const linhas = [
      ["Pedido", "Produto", "Status", "Valor", "Comissão", "Data"],
      ...pedidos.map((p) => [
        p.numero_pedido || `#${p.shopify_order_id}`,
        p.nome_produto || "",
        p.cancelado ? "Cancelado" : "Pago",
        p.valor_item.toFixed(2).replace(".", ","),
        p.comissao.toFixed(2).replace(".", ","),
        fmtDate(p.criado_em),
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus_pedidos_${de}_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCard = (label: string, value: string, color = "#111") => (
    <div style={{ background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "26px", fontWeight: "800", color }}>{value}</p>
    </div>
  );

  const opcoesMes = mesesRecentes();
  const mesSelecionado = opcoesMes.find((o) => o.de === de && o.ate === ate)?.mes ?? "";

  return (
    <>
      {/* Boas-vindas */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "700" }}>Olá, {designer?.nome}!</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ background: "#f0fdf9", color: "#00C9A7", padding: "3px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>{designer?.percentual}% por design</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        {statCard("Pedidos no período", String(pedidos.length))}
        {statCard("Vendas no período", fmt(totalVendas))}
        {statCard("Comissão efetiva", `${percentualEfetivo}%`, "#00C9A7")}
        {statCard("Comissão gerada", fmt(totalComissao))}
        {statCard("A receber", fmt(aReceber), aReceber > 0 ? "#e53e3e" : "#38a169")}
      </div>

      {/* Vendas */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Vendas
            <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>({pedidos.length}{truncated ? "+" : ""})</span>
          </h2>
          {pedidos.length > 0 && (
            <button type="button" onClick={exportarCSV} style={{ padding: "5px 12px", border: "1px solid #ddd", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: "600", color: "#555", cursor: "pointer" }}>
              ↓ Exportar CSV
            </button>
          )}
        </div>

        {/* Busca + filtro de período */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Buscar por número do pedido ou produto..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 14px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px" }}
            />
          </div>
          <Form method="get" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <select
              value={mesSelecionado}
              onChange={(e) => {
                const opcao = opcoesMes.find((o) => o.mes === e.target.value);
                if (opcao) window.location.href = `?de=${opcao.de}&ate=${opcao.ate}`;
              }}
              style={{ ...dateInput, width: "100%", boxSizing: "border-box", cursor: "pointer", textTransform: "capitalize" }}
            >
              {opcoesMes.map((o) => (
                <option key={o.mes} value={o.mes} style={{ textTransform: "capitalize" }}>{o.label}</option>
              ))}
              {!mesSelecionado && <option value="">Personalizado</option>}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="date" name="de" defaultValue={de} style={{ ...dateInput, flex: 1, minWidth: 0 }} />
              <span style={{ color: "#aaa", fontSize: "13px", flexShrink: 0 }}>-</span>
              <input type="date" name="ate" defaultValue={ate} style={{ ...dateInput, flex: 1, minWidth: 0 }} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" style={{ flex: 1, boxSizing: "border-box", padding: "9px 14px", background: "#00C9A7", color: "#fff", border: "1px solid transparent", borderRadius: "8px", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>
                Aplicar
              </button>
              <a href="?" style={{ boxSizing: "border-box", padding: "9px 14px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", fontWeight: "700", fontSize: "14px", textDecoration: "none", display: "flex", alignItems: "center" }}>
                Limpar
              </a>
            </div>
          </Form>
        </div>

        {truncated && (
          <div style={{ padding: "8px 24px", background: "#fffbeb", borderBottom: "1px solid #fef3c7", fontSize: "12px", color: "#92400e" }}>
            Exibindo os 100 pedidos mais recentes. Ajuste o período para ver registros específicos.
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #eee" }}>
                {["Pedido/Produto", "Status", "Valor/Comissão"].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pedidosPagina.length === 0 && (
                <tr><td colSpan={3} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pedido encontrado</td></tr>
              )}
              {pedidosPagina.map((p, i) => (
                <tr key={`${p.shopify_order_id}-${i}`} style={{ borderBottom: "1px solid #f5f5f5", opacity: p.cancelado ? 0.5 : 1 }}>
                  <td style={td}>
                    <div style={{ fontWeight: "600" }}>{p.numero_pedido || `#${p.shopify_order_id}`}</div>
                    <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>{p.nome_produto} · {fmtDateTime(p.criado_em)}</div>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: "700",
                      background: p.cancelado ? "#fee2e2" : "#f0fff4",
                      color: p.cancelado ? "#e53e3e" : "#38a169",
                      border: `1px solid ${p.cancelado ? "#fecaca" : "#c6f6d5"}`,
                    }}>
                      {p.cancelado ? "Cancelado" : "Pago"}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ color: "#666" }}>{fmt(p.valor_item)}</div>
                    <div style={{ fontWeight: "700", color: p.cancelado ? "#ccc" : "#00C9A7", marginTop: "2px" }}>
                      {p.cancelado ? <s>{fmt(p.comissao)}</s> : fmt(p.comissao)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pedidosFiltrados.length > 0 && (
          <div style={{ padding: "12px 24px", borderTop: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888" }}>
              Mostrando
              <select
                value={porPagina}
                onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
                style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "12px" }}
              >
                {paginaOpcoes.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              por página
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#888" }}>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                style={{ padding: "5px 10px", border: "1px solid #ddd", borderRadius: "6px", background: "#fff", cursor: paginaAtual === 1 ? "not-allowed" : "pointer", opacity: paginaAtual === 1 ? 0.5 : 1 }}
              >
                ←
              </button>
              Página {paginaAtual} de {totalPaginas}
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                style={{ padding: "5px 10px", border: "1px solid #ddd", borderRadius: "6px", background: "#fff", cursor: paginaAtual === totalPaginas ? "not-allowed" : "pointer", opacity: paginaAtual === totalPaginas ? 0.5 : 1 }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagamentos */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Pagamentos recebidos</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
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
      </div>
    </>
  );
}
