import { useState, useEffect } from "react";
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

  // Padrão: mês atual (dia 1 até hoje) — issue #15: swap se de > ate
  const deRaw = url.searchParams.get("de") || primeiroDiaMes(mesAtual());
  const ateRaw = url.searchParams.get("ate") || hojeStr();
  const de = deRaw <= ateRaw ? deRaw : ateRaw;
  const ate = deRaw <= ateRaw ? ateRaw : deRaw;

  const { data: afiliada } = await supabase.from("afiliadas").select("*").eq("id", id).single();

  // Issue #10: meses no range para seletor de referência de pagamento
  const mesesNoRange = new Set<string>();
  const deDate = new Date(de);
  const ateDate = new Date(ate);
  const cur = new Date(deDate.getFullYear(), deDate.getMonth(), 1);
  while (cur <= ateDate) {
    mesesNoRange.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  const mesesArray = Array.from(mesesNoRange);
  const mesPagamento = mesesArray[0] ?? de.substring(0, 7);

  // Issue #11: limita a 100 pedidos por período
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .eq("afiliada_id", id)
    .gte("criado_em", `${de}T00:00:00`)
    .lte("criado_em", `${ate}T23:59:59`)
    .order("criado_em", { ascending: false })
    .limit(100);

  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("afiliada_id", id)
    .in("mes_referencia", mesesArray)
    .order("pago_em", { ascending: false });

  const pedidosFiltrados = pedidos ?? [];
  const pagamentosFiltrados = pagamentos ?? [];

  const totalComissao = Math.round(pedidosFiltrados.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0) * 100) / 100;
  const totalPago = Math.round(pagamentosFiltrados.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const aReceber = Math.max(0, Math.round((totalComissao - totalPago) * 100) / 100);

  return { afiliada, pedidos: pedidosFiltrados, pagamentos: pagamentosFiltrados, aReceber, totalComissao, de, ate, mesPagamento, mesesArray, truncated: pedidosFiltrados.length === 100 };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await requireAuth(request);
  const { id } = params;
  const form = await request.formData();

  if (form.get("intent") === "pagar") {
    const valor = parseFloat(form.get("valor") as string);
    const mesRef = form.get("mes") as string;
    await supabase.from("pagamentos").insert({
      afiliada_id: id,
      valor,
      mes_referencia: mesRef,
      observacao: form.get("observacao") || null,
      pago_em: new Date().toISOString(), // Issue #5
    });

    // Busca os pedidos de verdade daquele mês (independente do filtro de período visível na tela)
    // pra montar o comprovante que vai ser copiado e mandado pra influencer.
    const { data: pedidosDoMes } = await supabase
      .from("pedidos")
      .select("shopify_order_id, valor_total, comissao, criado_em")
      .eq("afiliada_id", id)
      .eq("mes_referencia", mesRef)
      .eq("cancelado", false)
      .order("criado_em", { ascending: true });

    return { sucesso: "pago", pedidosDoMes: pedidosDoMes ?? [], valorPago: valor, mesPago: mesRef };
  }

  if (form.get("intent") === "deletar_pagamento") {
    const pagamentoId = form.get("pagamento_id") as string;
    await supabase.from("pagamentos").delete().eq("id", pagamentoId);
    return { sucesso: "deletado" };
  }

  if (form.get("intent") === "editar") {
    const { error } = await supabase.from("afiliadas").update({
      nome: form.get("nome"),
      email: form.get("email"),
      pix: form.get("pix") || null,
      instagram: (form.get("instagram") as string)?.replace(/^@/, "").trim() || null,
      whatsapp: form.get("whatsapp") || null,
      cpf: form.get("cpf") || null,
      atualizado_em: new Date().toISOString(),
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

function fmtDataCurta(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function gerarTextoComprovante(
  pedidosDoMes: Array<{ shopify_order_id: string; valor_total: number; comissao: number; criado_em: string }>,
  mesRef: string,
  valorPago: number
) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [ano, mes] = mesRef.split("-");
  const mesLabel = new Date(Number(ano), Number(mes) - 1).toLocaleString("pt-BR", { month: "long" });

  const linhas = pedidosDoMes.map((p) => {
    const percentual = p.valor_total > 0 ? Math.round((p.comissao / p.valor_total) * 100) : 0;
    return `${fmtDataCurta(p.criado_em)} — Pedido #${p.shopify_order_id}: ${fmt(p.valor_total)} → ${percentual}% = ${fmt(p.comissao)}`;
  });
  const subtotal = pedidosDoMes.reduce((s, p) => s + p.comissao, 0);

  return [
    `💰 Vendas de ${mesLabel} usando seu cupom`,
    "",
    ...linhas,
    `Subtotal: ${fmt(subtotal)}`,
    "",
    `➡️ Total a receber: ${fmt(valorPago)}`,
    "",
    "Já te mando o comprovante do pagamento 💚",
  ].join("\n");
}

export default function PainelAfiliadaDetalhe() {
  const { afiliada, pedidos, pagamentos, aReceber, totalComissao, de, ate, mesPagamento, mesesArray, truncated } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    sucesso?: string;
    erro?: string;
    pedidosDoMes?: Array<{ shopify_order_id: string; valor_total: number; comissao: number; criado_em: string }>;
    valorPago?: number;
    mesPago?: string;
  }>();
  const [searchParams] = useSearchParams();
  const [editando, setEditando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Reseta checkbox e monta o texto do comprovante após pagamento registrado com sucesso
  useEffect(() => {
    if (fetcher.data?.sucesso === "pago") {
      setConfirmado(false);
      if (fetcher.data.pedidosDoMes && fetcher.data.mesPago != null && fetcher.data.valorPago != null) {
        setComprovante(gerarTextoComprovante(fetcher.data.pedidosDoMes, fetcher.data.mesPago, fetcher.data.valorPago));
        setCopiado(false);
      }
    }
  }, [fetcher.data]);

  if (!afiliada) return <p>Influencer não encontrada.</p>;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  // Issue #4: detecta se o form de pagamento está em submissão
  const isPaying = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "pagar";

  // Issue #12: exporta pedidos como CSV com BOM para Excel reconhecer UTF-8
  const exportarCSV = () => {
    const linhas = [
      ["Pedido", "Status", "Venda", "Comissão", "Data"],
      ...pedidos.map((p) => [
        `#${p.shopify_order_id}`,
        p.cancelado ? "Cancelado" : "Pago",
        p.valor_total.toFixed(2).replace(".", ","),
        p.comissao.toFixed(2).replace(".", ","),
        fmtDate(p.criado_em),
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${afiliada.nome}_${de}_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <Link to="/painel/influencers" style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>← Influencers</Link>
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

          {afiliada.instagram && (
            <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#00C9A7", fontWeight: "600" }}>
              @{afiliada.instagram}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
            {afiliada.whatsapp && (
              <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
                📱 {afiliada.whatsapp}
              </p>
            )}
            {afiliada.cpf && (
              <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
                CPF: <strong>{afiliada.cpf}</strong>
              </p>
            )}
            {afiliada.pix && (
              <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
                PIX: <strong>{afiliada.pix}</strong>
              </p>
            )}
          </div>

          {aReceber > 0 && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <p style={{ margin: "0 0 12px", fontWeight: "700", fontSize: "14px" }}>Registrar pagamento</p>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="pagar" />

                {/* Issue #10: seletor de mês quando o range cobre mais de um mês */}
                {mesesArray.length > 1 ? (
                  <div style={{ marginBottom: "4px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>Mês de referência</label>
                    <select name="mes" defaultValue={mesPagamento} style={{ ...inputStyle, cursor: "pointer" }}>
                      {mesesArray.map((m) => (
                        <option key={m} value={m} style={{ textTransform: "capitalize" }}>{fmtMes(m)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="mes" value={mesPagamento} />
                    <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#999", textTransform: "capitalize" }}>
                      ref. {fmtMes(mesPagamento)}
                    </p>
                  </>
                )}

                <input type="number" name="valor" defaultValue={aReceber} step="0.01" style={inputStyle} />
                <input type="text" name="observacao" placeholder="Observação (opcional)" style={inputStyle} />
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#555", marginBottom: "12px", cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={confirmado}
                    onChange={e => setConfirmado(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#38a169" }}
                  />
                  Confirmo que o pagamento foi realizado
                </label>
                <button
                  type="submit"
                  disabled={isPaying || !confirmado}
                  style={{ width: "100%", padding: "12px", background: !confirmado ? "#ccc" : isPaying ? "#888" : "#38a169", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: !confirmado || isPaying ? "not-allowed" : "pointer", fontSize: "14px", transition: "background 0.15s" }}
                >
                  {isPaying ? "Registrando..." : "✓ Marcar como pago"}
                </button>
              </fetcher.Form>
              {fetcher.data?.sucesso === "pago" && (
                <p style={{ color: "#38a169", fontSize: "12px", marginTop: "8px", fontWeight: "600" }}>✓ Pagamento registrado</p>
              )}
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
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>Instagram</label>
                <div style={{ position: "relative", marginBottom: "8px" }}>
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#888", fontWeight: "700", fontSize: "14px" }}>@</span>
                  <input name="instagram" defaultValue={afiliada.instagram ?? ""} placeholder="seuperfil" style={{ ...inputStyle, paddingLeft: "26px", marginBottom: 0 }} />
                </div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>WhatsApp</label>
                <input name="whatsapp" defaultValue={afiliada.whatsapp ?? ""} placeholder="(11) 99999-9999" style={inputStyle} />
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#888", marginBottom: "4px" }}>CPF</label>
                <input name="cpf" defaultValue={afiliada.cpf ?? ""} placeholder="000.000.000-00" style={inputStyle} />
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
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
                Pedidos
                {/* Issue #11: indica quando resultado está truncado */}
                <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>({pedidos.length}{truncated ? "+" : ""})</span>
              </h2>
              {/* Issue #12: exporta CSV */}
              {pedidos.length > 0 && (
                <button type="button" onClick={exportarCSV} style={{ padding: "5px 12px", border: "1px solid #ddd", borderRadius: "6px", background: "#fff", fontSize: "12px", fontWeight: "600", color: "#555", cursor: "pointer" }}>
                  ↓ Exportar CSV
                </button>
              )}
            </div>
            {truncated && (
              <div style={{ padding: "8px 24px", background: "#fffbeb", borderBottom: "1px solid #fef3c7", fontSize: "12px", color: "#92400e" }}>
                Exibindo os 100 pedidos mais recentes. Ajuste o período para ver registros específicos.
              </div>
            )}
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
                {["Data", "Mês ref.", "Valor", "Observação", ""].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pagamentos.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "#999" }}>Nenhum pagamento neste período</td></tr>}
                {pagamentos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px", textTransform: "capitalize" }}>{fmtMes(p.mes_referencia)}</td>
                    <td style={{ ...td, fontWeight: "700", color: "#38a169" }}>{fmt(p.valor)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px" }}>{p.observacao || "—"}</td>
                    <td style={td}>
                      <fetcher.Form
                        method="post"
                        onSubmit={e => { if (!window.confirm(`Remover pagamento de ${fmt(p.valor)}?`)) e.preventDefault(); }}
                      >
                        <input type="hidden" name="intent" value="deletar_pagamento" />
                        <input type="hidden" name="pagamento_id" value={p.id} />
                        <button type="submit" style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: "13px", fontWeight: "600", padding: "2px 6px", borderRadius: "4px" }}>
                          ✕ Remover
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Popup do comprovante pra copiar e mandar pra influencer */}
      {comprovante && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
        >
          <div
            style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "480px", width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
          >
            <p style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: "800" }}>✓ Pagamento registrado</p>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#888" }}>Copia e cola essa mensagem pra mandar pra influencer:</p>
            <textarea
              readOnly
              value={comprovante}
              style={{ width: "100%", boxSizing: "border-box", minHeight: "220px", padding: "14px", border: "1px solid #ddd", borderRadius: "10px", fontSize: "13px", fontFamily: "inherit", lineHeight: "1.6", resize: "vertical", color: "#333" }}
              onFocus={(e) => e.target.select()}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(comprovante);
                  setCopiado(true);
                }}
                style={{ flex: 1, padding: "11px", background: copiado ? "#38a169" : "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}
              >
                {copiado ? "✓ Copiado!" : "Copiar texto"}
              </button>
              <button
                type="button"
                onClick={() => setComprovante(null)}
                style={{ padding: "11px 18px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
