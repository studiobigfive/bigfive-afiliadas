import { useState, useEffect, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Link, Form, useFetcher } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";

function primeiroDiaMes(yyyymm: string) { return `${yyyymm}-01`; }
function ultimoDiaMes(yyyymm: string) {
  const [a, m] = yyyymm.split("-").map(Number);
  return `${yyyymm}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}
function mesAtualStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function mesAnteriorStr() {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}
function hojeStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function fmtMes(yyyymm: string) {
  if (!yyyymm) return "—";
  const [a, m] = yyyymm.split("-");
  return new Date(Number(a), Number(m) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const id = params.id!;
  const url = new URL(request.url);

  const deRaw = url.searchParams.get("de") || primeiroDiaMes(mesAtualStr());
  const ateRaw = url.searchParams.get("ate") || hojeStr();
  const de = deRaw <= ateRaw ? deRaw : ateRaw;
  const ate = deRaw <= ateRaw ? ateRaw : deRaw;

  const { data: designer } = await supabase
    .from("designers")
    .select("*")
    .eq("id", id)
    .single();

  if (!designer) throw new Response("Designer não encontrado", { status: 404 });

  const { data: produtos } = await supabase
    .from("designer_produtos")
    .select("id, shopify_product_id, nome_produto")
    .eq("designer_id", id)
    .order("nome_produto");

  const { data: pedidos } = await supabase
    .from("pedidos_designer")
    .select("id, shopify_order_id, nome_produto, shopify_product_id, valor_item, comissao, mes_referencia, criado_em, cancelado")
    .eq("designer_id", id)
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
  const mesesArray = Array.from(mesesNoRange).sort();

  const { data: pagamentos } = await supabase
    .from("pagamentos_designer")
    .select("id, valor, mes_referencia, observacao, pago_em")
    .eq("designer_id", id)
    .in("mes_referencia", mesesArray.length ? mesesArray : ["_none_"])
    .order("pago_em", { ascending: false });

  const pedidosFiltrados = pedidos ?? [];
  const pagamentosFiltrados = pagamentos ?? [];

  const totalComissao = Math.round(
    pedidosFiltrados.filter(p => !p.cancelado).reduce((s, p) => s + (p.comissao ?? 0), 0) * 100
  ) / 100;
  const totalPago = Math.round(
    pagamentosFiltrados.reduce((s, p) => s + (p.valor ?? 0), 0) * 100
  ) / 100;
  const aReceber = Math.max(0, Math.round((totalComissao - totalPago) * 100) / 100);

  const produtosVinculadosIds = (produtos ?? []).map(p => p.shopify_product_id);

  return {
    designer,
    produtos: produtos ?? [],
    pedidos: pedidosFiltrados,
    pagamentos: pagamentosFiltrados,
    totalComissao,
    totalPago,
    aReceber,
    de,
    ate,
    mesesArray,
    mesPagamento: mesesArray[mesesArray.length - 1] || mesAtualStr(),
    truncated: pedidosFiltrados.length === 100,
    produtosVinculadosIds,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await requireAuth(request);
  const id = params.id!;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "pagar") {
    const valor = Math.round(parseFloat(form.get("valor") as string) * 100) / 100;
    const mesRef = form.get("mes") as string;
    const observacao = (form.get("observacao") as string)?.trim() || null;
    if (!valor || valor <= 0 || isNaN(valor)) return { erro: "Valor inválido" };
    if (!mesRef) return { erro: "Selecione o mês de referência" };
    const { error } = await supabase.from("pagamentos_designer").insert({
      designer_id: id,
      valor,
      mes_referencia: mesRef,
      observacao,
      pago_em: new Date().toISOString(),
    });
    if (error) return { erro: error.message };
    return { sucesso: "pago" };
  }

  if (intent === "deletar_pagamento") {
    const pagId = form.get("pagamento_id") as string;
    await supabase.from("pagamentos_designer").delete().eq("id", pagId);
    return { sucesso: "deletado" };
  }

  if (intent === "add_produto") {
    const shopifyProductId = form.get("shopify_product_id") as string;
    const nomeProduto = form.get("nome_produto") as string;
    const { data: existente } = await supabase
      .from("designer_produtos")
      .select("id")
      .eq("designer_id", id)
      .eq("shopify_product_id", shopifyProductId)
      .single();
    if (existente) return { erro_produto: "Produto já vinculado" };
    await supabase.from("designer_produtos").insert({
      designer_id: id,
      shopify_product_id: shopifyProductId,
      nome_produto: nomeProduto,
    });
    return { sucesso: "produto_adicionado" };
  }

  if (intent === "remove_produto") {
    const prodId = form.get("produto_id") as string;
    await supabase.from("designer_produtos").delete().eq("id", prodId);
    return { sucesso: "produto_removido" };
  }

  if (intent === "editar") {
    const percentual = parseFloat(form.get("percentual") as string);
    if (!percentual || percentual <= 0 || percentual > 100 || isNaN(percentual)) {
      return { erro_editar: "Percentual inválido (1–100)" };
    }
    const { error } = await supabase.from("designers").update({
      nome: (form.get("nome") as string)?.trim(),
      email: (form.get("email") as string)?.trim() || null,
      pix: (form.get("pix") as string)?.trim() || null,
      instagram: (form.get("instagram") as string)?.replace(/^@/, "").trim() || null,
      whatsapp: (form.get("whatsapp") as string)?.trim() || null,
      cpf: (form.get("cpf") as string)?.trim() || null,
      percentual,
      cupom: (form.get("cupom") as string)?.toUpperCase().trim() || null,
    }).eq("id", id);
    if (error) return { erro_editar: error.message };
    return { sucesso: "editado" };
  }

  return null;
};

// ── Styles ──────────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: "700",
  color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", background: "#f9f9f9",
};
const td: React.CSSProperties = { padding: "13px 16px", fontSize: "14px" };
const dateInput: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", background: "#fff",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #ddd", borderRadius: "8px",
  fontSize: "14px", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: "600", color: "#666", marginBottom: "5px",
};
const card: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  marginBottom: "20px",
};

export default function PainelDesignerDetalhe() {
  const {
    designer, produtos, pedidos, pagamentos,
    totalComissao, totalPago, aReceber,
    de, ate, mesesArray, mesPagamento,
    truncated, produtosVinculadosIds,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<{
    sucesso?: string;
    erro?: string;
    erro_produto?: string;
    erro_editar?: string;
  }>();
  const buscaFetcher = useFetcher<{ produtos: Array<{ id: string; title: string; image: string | null }> }>();
  const [confirmado, setConfirmado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        buscaFetcher.load(`/api/buscar-produtos?q=${encodeURIComponent(value.trim())}`);
      }, 400);
    }
  };

  const isPaying = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "pagar";

  useEffect(() => {
    if (fetcher.data?.sucesso === "pago") setConfirmado(false);
    if (fetcher.data?.sucesso === "editado") setEditando(false);
  }, [fetcher.data]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  const produtosVinculadosSet = new Set(produtosVinculadosIds);

  const atalho = (label: string, deVal: string, ateVal: string) => (
    <a href={`?de=${deVal}&ate=${ateVal}`} style={{
      padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600",
      textDecoration: "none", border: "1px solid #ddd",
      background: de === deVal && ate === ateVal ? "#111" : "#fff",
      color: de === deVal && ate === ateVal ? "#fff" : "#555",
    }}>{label}</a>
  );

  return (
    <>
      {/* Breadcrumb + cabeçalho */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "6px" }}>
          <Link to="/painel/designers" style={{ color: "#aaa", textDecoration: "none" }}>← Designers</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "800" }}>{designer.nome}</h1>
          {designer.instagram && (
            <span style={{ color: "#00C9A7", fontWeight: "600", fontSize: "14px" }}>@{designer.instagram}</span>
          )}
          <span style={{ background: "#f0fdf9", color: "#00C9A7", padding: "3px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
            {designer.percentual}% por design
          </span>
          {designer.cupom && (
            <span style={{ background: "#111", color: "#fff", padding: "3px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", letterSpacing: "1px" }}>
              {designer.cupom}
            </span>
          )}
          {!designer.ativo && (
            <span style={{ background: "#fee2e2", color: "#e53e3e", padding: "3px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>INATIVO</span>
          )}
        </div>
      </div>

      {/* Filtro de período */}
      <div style={{ ...card, padding: "14px 20px", marginBottom: "20px" }}>
        <Form method="get" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#666" }}>Período:</span>
          <input type="date" name="de" defaultValue={de} style={dateInput} />
          <span style={{ color: "#aaa", fontSize: "13px" }}>até</span>
          <input type="date" name="ate" defaultValue={ate} style={dateInput} />
          <button type="submit" style={{ padding: "7px 16px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
            Filtrar
          </button>
          <div style={{ display: "flex", gap: "6px" }}>
            {atalho("Este mês", primeiroDiaMes(mesAtualStr()), hojeStr())}
            {atalho("Mês passado", primeiroDiaMes(mesAnteriorStr()), ultimoDiaMes(mesAnteriorStr()))}
          </div>
        </Form>
      </div>

      {/* Layout principal */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <div>
          {/* Resumo */}
          <div style={{ ...card, padding: "20px" }}>
            <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Resumo do período
            </p>
            <div style={{ marginBottom: "14px" }}>
              <p style={{ margin: "0 0 2px", fontSize: "11px", color: "#aaa", fontWeight: "600", textTransform: "uppercase" }}>Comissão gerada</p>
              <p style={{ margin: 0, fontSize: "24px", fontWeight: "800", color: "#111" }}>{fmt(totalComissao)}</p>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <p style={{ margin: "0 0 2px", fontSize: "11px", color: "#aaa", fontWeight: "600", textTransform: "uppercase" }}>Pago</p>
              <p style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#38a169" }}>{fmt(totalPago)}</p>
            </div>
            <div style={{ paddingTop: "12px", borderTop: "2px solid #111" }}>
              <p style={{ margin: "0 0 2px", fontSize: "11px", color: "#aaa", fontWeight: "600", textTransform: "uppercase" }}>A receber</p>
              <p style={{ margin: 0, fontSize: "26px", fontWeight: "800", color: aReceber > 0 ? "#e53e3e" : "#38a169" }}>{fmt(aReceber)}</p>
            </div>

            {(designer.pix || designer.whatsapp || designer.cpf || designer.email) && (
              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f5f5f5", fontSize: "12px", color: "#666", lineHeight: "1.8" }}>
                {designer.pix && <div><strong>PIX:</strong> {designer.pix}</div>}
                {designer.whatsapp && <div><strong>WhatsApp:</strong> {designer.whatsapp}</div>}
                {designer.cpf && <div><strong>CPF:</strong> {designer.cpf}</div>}
                {designer.email && <div><strong>Email:</strong> {designer.email}</div>}
              </div>
            )}
          </div>

          {/* Registrar pagamento */}
          <div style={{ ...card, padding: "20px" }}>
            <p style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: "700" }}>Registrar pagamento</p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="pagar" />
              <div style={{ marginBottom: "12px" }}>
                <label style={labelStyle}>Valor (R$)</label>
                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={aReceber > 0 ? aReceber : ""}
                  required
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={labelStyle}>Mês de referência</label>
                {mesesArray.length > 1 ? (
                  <select name="mes" defaultValue={mesPagamento} style={{ ...inputStyle, background: "#fff" }}>
                    {[...mesesArray].reverse().map(m => (
                      <option key={m} value={m}>{fmtMes(m)}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="mes" value={mesPagamento} />
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#444", textTransform: "capitalize" }}>
                      {fmtMes(mesPagamento)}
                    </p>
                  </>
                )}
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Observação (opcional)</label>
                <input name="observacao" style={inputStyle} placeholder="Ex: Pix enviado" />
              </div>

              {fetcher.data?.erro && (
                <div style={{ padding: "8px 10px", background: "#fee2e2", color: "#e53e3e", borderRadius: "6px", fontSize: "12px", marginBottom: "10px" }}>
                  {fetcher.data.erro}
                </div>
              )}
              {fetcher.data?.sucesso === "pago" && (
                <div style={{ padding: "8px 10px", background: "#f0fff4", color: "#38a169", borderRadius: "6px", fontSize: "12px", marginBottom: "10px" }}>
                  Pagamento registrado!
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#555", marginBottom: "12px", cursor: "pointer" }}>
                <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
                Confirmo que o pagamento foi realizado
              </label>

              <button
                type="submit"
                disabled={isPaying || !confirmado}
                style={{
                  width: "100%", padding: "11px",
                  background: !confirmado ? "#ccc" : isPaying ? "#888" : "#111",
                  color: "#fff", border: "none", borderRadius: "8px",
                  fontWeight: "700", fontSize: "14px",
                  cursor: !confirmado || isPaying ? "not-allowed" : "pointer",
                }}
              >
                {isPaying ? "Registrando..." : "Marcar como pago"}
              </button>
            </fetcher.Form>
          </div>

          {/* Editar dados */}
          <div style={{ ...card, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setEditando(!editando)}
              style={{ width: "100%", padding: "14px 20px", background: "none", border: "none", textAlign: "left", fontWeight: "700", fontSize: "14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              Editar dados
              <span style={{ color: "#aaa", fontSize: "12px" }}>{editando ? "▲" : "▼"}</span>
            </button>

            {editando && (
              <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f5f5f5" }}>
                <fetcher.Form method="post" style={{ paddingTop: "14px" }}>
                  <input type="hidden" name="intent" value="editar" />
                  {([
                    { name: "nome", label: "Nome", type: "text", value: designer.nome },
                    { name: "email", label: "E-mail", type: "email", value: designer.email ?? "" },
                    { name: "pix", label: "PIX", type: "text", value: designer.pix ?? "" },
                    { name: "whatsapp", label: "WhatsApp", type: "text", value: designer.whatsapp ?? "" },
                    { name: "cpf", label: "CPF", type: "text", value: designer.cpf ?? "" },
                  ] as const).map(f => (
                    <div key={f.name} style={{ marginBottom: "10px" }}>
                      <label style={labelStyle}>{f.label}</label>
                      <input name={f.name} type={f.type} defaultValue={f.value} style={inputStyle} />
                    </div>
                  ))}
                  <div style={{ marginBottom: "10px" }}>
                    <label style={labelStyle}>Instagram</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#888", fontWeight: "700" }}>@</span>
                      <input name="instagram" defaultValue={designer.instagram ?? ""} style={{ ...inputStyle, paddingLeft: "24px" }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={labelStyle}>Comissão por design (%)</label>
                    <div style={{ position: "relative" }}>
                      <input name="percentual" type="number" min="1" max="100" step="0.5" defaultValue={designer.percentual} style={{ ...inputStyle, paddingRight: "28px" }} />
                      <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#888" }}>%</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Cupom de afiliado</label>
                    <input name="cupom" defaultValue={designer.cupom ?? ""} style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }} />
                  </div>
                  {fetcher.data?.erro_editar && (
                    <div style={{ padding: "8px", background: "#fee2e2", color: "#e53e3e", borderRadius: "6px", fontSize: "12px", marginBottom: "10px" }}>
                      {fetcher.data.erro_editar}
                    </div>
                  )}
                  {fetcher.data?.sucesso === "editado" && (
                    <div style={{ padding: "8px", background: "#f0fff4", color: "#38a169", borderRadius: "6px", fontSize: "12px", marginBottom: "10px" }}>
                      ✓ Salvo com sucesso
                    </div>
                  )}
                  <button type="submit" style={{ width: "100%", padding: "10px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>
                    Salvar alterações
                  </button>
                </fetcher.Form>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN ────────────────────────────────────────────── */}
        <div>
          {/* Produtos vinculados */}
          <div style={card}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: "700" }}>Produtos com design deste parceiro</h2>
              <p style={{ margin: 0, fontSize: "12px", color: "#aaa" }}>
                Pedidos com estes produtos geram comissão de {designer.percentual}%
                {designer.cupom && ` (exceto quando o cupom ${designer.cupom} for usado)`}
              </p>
            </div>

            {/* Busca ao vivo na Shopify */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5", background: "#fafafa" }}>
              <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: "600", color: "#555" }}>Buscar e vincular produto</p>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Digite para buscar produtos no catálogo..."
                  style={{ ...inputStyle }}
                />
                {buscaFetcher.state === "loading" && (
                  <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#aaa" }}>
                    buscando...
                  </span>
                )}
              </div>

              {/* Resultados */}
              {query.trim().length >= 2 && buscaFetcher.state === "idle" && (buscaFetcher.data?.produtos ?? []).length === 0 && (
                <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#999" }}>
                  Nenhum produto encontrado para "{query}"
                </p>
              )}
              {(buscaFetcher.data?.produtos ?? []).length > 0 && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(buscaFetcher.data!.produtos).map(produto => {
                    const jaVinculado = produtosVinculadosSet.has(produto.id);
                    return (
                      <div key={produto.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#fff", borderRadius: "8px", border: "1px solid #eee" }}>
                        {produto.image && (
                          <img src={produto.image} alt="" width={40} height={40} style={{ objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
                        )}
                        <span style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>{produto.title}</span>
                        {jaVinculado ? (
                          <span style={{ fontSize: "12px", color: "#38a169", fontWeight: "700", flexShrink: 0 }}>✓ Vinculado</span>
                        ) : (
                          <fetcher.Form method="post" style={{ flexShrink: 0 }}>
                            <input type="hidden" name="intent" value="add_produto" />
                            <input type="hidden" name="shopify_product_id" value={produto.id} />
                            <input type="hidden" name="nome_produto" value={produto.title} />
                            <button
                              type="submit"
                              style={{ padding: "5px 14px", background: "#00C9A7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                            >
                              Vincular
                            </button>
                          </fetcher.Form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {fetcher.data?.erro_produto && (
                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#e53e3e" }}>{fetcher.data.erro_produto}</p>
              )}
              {fetcher.data?.sucesso === "produto_adicionado" && (
                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#38a169", fontWeight: "600" }}>✓ Produto vinculado!</p>
              )}
            </div>

            {/* Lista de produtos vinculados */}
            {produtos.length === 0 ? (
              <p style={{ padding: "28px 24px", textAlign: "center", color: "#999", margin: 0, fontSize: "14px" }}>
                Nenhum produto vinculado ainda. Use a busca acima.
              </p>
            ) : (
              <div>
                {produtos.map(p => (
                  <div key={p.id} style={{ padding: "12px 24px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>{p.nome_produto || "Produto sem nome"}</span>
                      <span style={{ marginLeft: "8px", fontSize: "11px", color: "#ccc" }}>#{p.shopify_product_id}</span>
                    </div>
                    <fetcher.Form
                      method="post"
                      onSubmit={(e) => { if (!window.confirm(`Remover "${p.nome_produto}"?`)) e.preventDefault(); }}
                      style={{ flexShrink: 0 }}
                    >
                      <input type="hidden" name="intent" value="remove_produto" />
                      <input type="hidden" name="produto_id" value={p.id} />
                      <button
                        type="submit"
                        style={{ padding: "4px 10px", border: "1px solid #e53e3e", color: "#e53e3e", background: "transparent", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                      >
                        ✕ Remover
                      </button>
                    </fetcher.Form>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pedidos com designs */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>
                Pedidos com designs
                <span style={{ marginLeft: "8px", fontSize: "13px", color: "#aaa", fontWeight: "400" }}>
                  ({pedidos.length}{truncated ? "+" : ""})
                </span>
              </h2>
            </div>
            {truncated && (
              <div style={{ padding: "8px 24px", background: "#fffbeb", borderBottom: "1px solid #fef3c7", fontSize: "12px", color: "#92400e" }}>
                Exibindo os 100 mais recentes. Ajuste o período para ver registros específicos.
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  {["Produto", "Pedido", "Valor item", "Comissão", "Mês ref.", "Data"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pedidos.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: "#999" }}>
                      Nenhum pedido neste período
                    </td>
                  </tr>
                )}
                {pedidos.map(p => (
                  <tr
                    key={`${p.shopify_order_id}-${p.shopify_product_id}`}
                    style={{ borderBottom: "1px solid #f5f5f5", opacity: p.cancelado ? 0.5 : 1 }}
                  >
                    <td style={{ ...td, fontWeight: "600" }}>
                      {p.nome_produto || "—"}
                      {p.cancelado && (
                        <span style={{ marginLeft: "6px", background: "#fee2e2", color: "#e53e3e", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>
                          CANCEL.
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: "#888" }}>#{p.shopify_order_id}</td>
                    <td style={{ ...td, color: "#666" }}>{fmt(p.valor_item ?? 0)}</td>
                    <td style={{ ...td, fontWeight: "700", color: p.cancelado ? "#ccc" : "#00C9A7" }}>
                      {p.cancelado ? <s>{fmt(p.comissao ?? 0)}</s> : fmt(p.comissao ?? 0)}
                    </td>
                    <td style={{ ...td, color: "#888", fontSize: "13px", textTransform: "capitalize" }}>
                      {fmtMes(p.mes_referencia ?? "")}
                    </td>
                    <td style={{ ...td, color: "#888", fontSize: "13px" }}>{fmtDate(p.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagamentos registrados */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Pagamentos registrados</h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  {["Data", "Mês ref.", "Valor", "Observação", ""].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagamentos.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...td, textAlign: "center", color: "#999" }}>
                      Nenhum pagamento neste período
                    </td>
                  </tr>
                )}
                {pagamentos.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ ...td, color: "#666" }}>{fmtDate(p.pago_em)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px", textTransform: "capitalize" }}>{fmtMes(p.mes_referencia)}</td>
                    <td style={{ ...td, fontWeight: "700", color: "#38a169" }}>{fmt(p.valor)}</td>
                    <td style={{ ...td, color: "#888", fontSize: "13px" }}>{p.observacao || "—"}</td>
                    <td style={td}>
                      <fetcher.Form
                        method="post"
                        onSubmit={(e) => { if (!window.confirm("Remover este pagamento?")) e.preventDefault(); }}
                      >
                        <input type="hidden" name="intent" value="deletar_pagamento" />
                        <input type="hidden" name="pagamento_id" value={p.id} />
                        <button
                          type="submit"
                          style={{ padding: "4px 10px", border: "1px solid #e53e3e", color: "#e53e3e", background: "transparent", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                        >
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
    </>
  );
}
