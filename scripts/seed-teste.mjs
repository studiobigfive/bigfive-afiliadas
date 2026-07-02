import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_VERSION = "2025-10";
const MES = "2026-06";
const round2 = (v) => Math.round(v * 100) / 100;
const dia = (d) => `2026-06-${String(d).padStart(2, "0")}T12:00:00Z`;

// Tiers reais (lidos do banco) — fallback se vazio
const { data: tiersDb } = await supabase.from("tiers_comissao").select("vendas_ate, percentual");
const tiers = [...(tiersDb ?? [])].sort((a, b) => {
  if (a.vendas_ate == null) return 1;
  if (b.vendas_ate == null) return -1;
  return a.vendas_ate - b.vendas_ate;
});
const achaTier = (novoTotal) => tiers.find((t) => t.vendas_ate == null || novoTotal <= t.vendas_ate) ?? { percentual: 12 };

// ── Produtos reais da loja (pra ficar realista) ──────────────────────────────
async function getProdutosReais(n) {
  const { data: cred } = await supabase
    .from("Session").select("shop, accessToken").not("accessToken", "is", null).limit(1).single();
  if (!cred?.accessToken) return null;
  const gql = `query { products(first: ${n}) { edges { node { id title } } } }`;
  const res = await fetch(`https://${cred.shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": cred.accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.errors) return null;
  return (json.data?.products?.edges ?? []).map((e) => ({ id: String(e.node.id).split("/").pop(), title: e.node.title }));
}

let produtos = await getProdutosReais(10);
if (!produtos || produtos.length < 5) {
  console.log("(usando produtos fictícios — não consegui puxar reais)");
  produtos = Array.from({ length: 6 }, (_, i) => ({ id: `9000000000${i}`, title: `[TESTE] Estampa ${i + 1}` }));
} else {
  console.log(`(puxei ${produtos.length} produtos reais da loja)`);
}

// ── IDs ───────────────────────────────────────────────────────────────────
const id = {
  bia: randomUUID(), duda: randomUUID(), leo: randomUUID(), manu: randomUUID(), rafa: randomUUID(),
  studioA: randomUUID(), studioB: randomUUID(), studioC: randomUUID(), manuD: randomUUID(), rafaD: randomUUID(),
};

// ── Afiliadas (5) ─────────────────────────────────────────────────────────
const afiliadas = [
  { id: id.bia, nome: "[TESTE] Bia", email: "teste+bia@bigfivehype.com.br", cupom: "BIA10", pix: "bia@pix", instagram: "bia.teste", whatsapp: "(11) 90000-0001", cpf: "000.000.000-01", ativo: true },
  { id: id.duda, nome: "[TESTE] Duda", email: "teste+duda@bigfivehype.com.br", cupom: "DUDA10", pix: "duda@pix", instagram: "duda.teste", whatsapp: "(11) 90000-0002", cpf: "000.000.000-02", ativo: true },
  { id: id.leo, nome: "[TESTE] Léo", email: "teste+leo@bigfivehype.com.br", cupom: "LEO10", pix: "leo@pix", instagram: "leo.teste", whatsapp: "(11) 90000-0003", cpf: "000.000.000-03", ativo: true },
  { id: id.manu, nome: "[TESTE] Manu (afiliada+designer)", email: "teste+manu@bigfivehype.com.br", cupom: "MANU10", pix: "manu@pix", instagram: "manu.teste", whatsapp: "(11) 90000-0004", cpf: "000.000.000-04", ativo: true },
  { id: id.rafa, nome: "[TESTE] Rafa (afiliada+designer)", email: "teste+rafa@bigfivehype.com.br", cupom: "RAFA10", pix: "rafa@pix", instagram: "rafa.teste", whatsapp: "(11) 90000-0005", cpf: "000.000.000-05", ativo: true },
];

// ── Designers (5; manuD/rafaD são as mesmas pessoas das afiliadas) ──────────
const designers = [
  { id: id.studioA, nome: "[TESTE] Studio A", email: "teste+sa@bigfivehype.com.br", percentual: 30, cupom: null, pix: "sa@pix", instagram: "studio.a", whatsapp: null, cpf: null, ativo: true },
  { id: id.studioB, nome: "[TESTE] Studio B", email: "teste+sb@bigfivehype.com.br", percentual: 25, cupom: "STUDIOB", pix: "sb@pix", instagram: "studio.b", whatsapp: null, cpf: null, ativo: true },
  { id: id.studioC, nome: "[TESTE] Studio C", email: "teste+sc@bigfivehype.com.br", percentual: 40, cupom: null, pix: "sc@pix", instagram: "studio.c", whatsapp: null, cpf: null, ativo: true },
  { id: id.manuD, nome: "[TESTE] Manu (designer)", email: "teste+manu@bigfivehype.com.br", percentual: 30, cupom: "MANU10", pix: "manu@pix", instagram: "manu.teste", whatsapp: null, cpf: null, ativo: true },
  { id: id.rafaD, nome: "[TESTE] Rafa (designer)", email: "teste+rafa@bigfivehype.com.br", percentual: 35, cupom: "RAFA10", pix: "rafa@pix", instagram: "rafa.teste", whatsapp: null, cpf: null, ativo: true },
];

// ── Vínculos produto→designer ───────────────────────────────────────────────
const P = (i) => produtos[i % produtos.length];
const vinculos = [
  { designer_id: id.studioA, p: P(0) },
  { designer_id: id.studioB, p: P(1) },
  { designer_id: id.studioC, p: P(2) },
  { designer_id: id.manuD, p: P(3) },
  { designer_id: id.rafaD, p: P(4) },
];
const donoDoProduto = new Map(vinculos.map((v) => [v.p.id, { designer_id: v.designer_id, nome: v.p.title }]));
const designerById = new Map(designers.map((d) => [d.id, d]));
const cupomToAfiliada = new Map(afiliadas.map((a) => [a.cupom, a]));

// ── Roteiro de vendas ────────────────────────────────────────────────────
// cupom: cupom usado (ou null). itens: produtos no pedido (idx em `produtos`, valor).
const vendas = [
  { oid: "TEST-1001", d: 5,  cupom: "BIA10",   total: 200,  itens: [] },
  { oid: "TEST-1002", d: 6,  cupom: "DUDA10",  total: 800,  itens: [] },
  { oid: "TEST-1003", d: 7,  cupom: "BIA10",   total: 300,  itens: [{ pi: 0, v: 300 }] },
  { oid: "TEST-1004", d: 8,  cupom: "LEO10",   total: 1500, itens: [] },
  { oid: "TEST-1005", d: 9,  cupom: "DUDA10",  total: 700,  itens: [] },
  { oid: "TEST-1006", d: 10, cupom: "DUDA10",  total: 1000, itens: [], reembolso: { valor: 500 } },          // parcial 50%
  { oid: "TEST-1007", d: 10, cupom: null,      total: 400,  itens: [{ pi: 2, v: 400 }] },                    // designer puro (sem cupom)
  { oid: "TEST-1008", d: 11, cupom: "LEO10",   total: 2000, itens: [] },
  { oid: "TEST-1009", d: 11, cupom: "BIA10",   total: 400,  itens: [{ pi: 0, v: 400 }], reembolso: { total: true } }, // total
  { oid: "TEST-1010", d: 12, cupom: "STUDIOB", total: 250,  itens: [{ pi: 1, v: 250 }] },                    // cupom do próprio designer → ninguém ganha
  { oid: "TEST-1011", d: 12, cupom: "LEO10",   total: 500,  itens: [], cancelado: true },                    // cancelado
  { oid: "TEST-1012", d: 13, cupom: "MANU10",  total: 500,  itens: [{ pi: 3, v: 500 }] },                    // cupom dela + produto dela → design NÃO duplica
  { oid: "TEST-1013", d: 14, cupom: "MANU10",  total: 400,  itens: [{ pi: 0, v: 400 }] },                    // cupom dela + produto de outro designer
  { oid: "TEST-1014", d: 14, cupom: "RAFA10",  total: 600,  itens: [{ pi: 4, v: 600 }] },                    // cupom dela + produto dela → design NÃO duplica
  { oid: "TEST-1015", d: 15, cupom: null,      total: 300,  itens: [{ pi: 3, v: 300 }] },                    // produto da Manu SEM cupom → ela ganha como designer
  { oid: "TEST-1016", d: 15, cupom: null,      total: 500,  itens: [{ pi: 4, v: 500 }] },                    // produto da Rafa SEM cupom → designer
  { oid: "TEST-1017", d: 16, cupom: "BIA10",   total: 350,  itens: [{ pi: 3, v: 350 }] },                    // cupom de outra afiliada + produto da Manu
];

// ── Processa (espelha webhook orders/paid) ────────────────────────────────
const acumAfiliada = {};
const pedidosRows = [];
const pedidosDesignerRows = [];

for (const venda of vendas) {
  const discountCodes = venda.cupom ? [venda.cupom.toUpperCase()] : [];

  // AFILIADA (por cupom)
  const afil = venda.cupom ? cupomToAfiliada.get(venda.cupom) : null;
  if (afil) {
    const acum = acumAfiliada[afil.id] ?? 0;
    const novoTotal = acum + venda.total;
    const tier = achaTier(novoTotal);
    const comissao = round2(venda.total * (tier.percentual / 100));
    pedidosRows.push({
      shopify_order_id: venda.oid, afiliada_id: afil.id, valor_total: venda.total,
      comissao, comissao_base: comissao, valor_reembolsado: 0,
      mes_referencia: MES, cancelado: !!venda.cancelado, criado_em: dia(venda.d),
    });
    if (!venda.cancelado) acumAfiliada[afil.id] = acum + venda.total;
  }

  // DESIGNERS (por produto)
  for (const item of venda.itens) {
    const prod = produtos[item.pi];
    const dono = donoDoProduto.get(prod.id);
    if (!dono) continue;
    const des = designerById.get(dono.designer_id);
    if (!des?.ativo) continue;
    if (des.cupom && discountCodes.includes(des.cupom.toUpperCase())) continue; // não duplica
    const comissao = round2(item.v * (des.percentual / 100));
    pedidosDesignerRows.push({
      shopify_order_id: venda.oid, designer_id: des.id, shopify_product_id: prod.id,
      nome_produto: prod.title, valor_item: item.v,
      comissao, comissao_base: comissao, valor_reembolsado: 0,
      mes_referencia: MES, cancelado: !!venda.cancelado, criado_em: dia(venda.d),
    });
  }
}

// ── Insere tudo ────────────────────────────────────────────────────────────
async function ins(tabela, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(tabela).insert(rows);
  if (error) console.log(`  ERRO insert ${tabela}: ${error.message}`);
  else console.log(`  ${tabela}: +${rows.length}`);
}

console.log("=== INSERINDO ===");
await ins("afiliadas", afiliadas);
await ins("designers", designers);
await ins("designer_produtos", vinculos.map((v) => ({ designer_id: v.designer_id, shopify_product_id: v.p.id, nome_produto: v.p.title })));
await ins("pedidos", pedidosRows);
await ins("pedidos_designer", pedidosDesignerRows);

// ── Reembolsos (espelha webhook refunds/create, COM idempotência) ──────────
async function aplicarReembolso(oid, refundId, valorReembolsado, total) {
  const { data: ja } = await supabase.from("refunds_processados").select("shopify_refund_id").eq("shopify_refund_id", refundId).single();
  if (ja) return "ignorado (idempotência)";
  // afiliada
  const { data: ped } = await supabase.from("pedidos").select("id, valor_total, comissao_base, valor_reembolsado").eq("shopify_order_id", oid).single();
  if (ped && ped.valor_total > 0) {
    const novoReemb = round2((ped.valor_reembolsado ?? 0) + valorReembolsado);
    const prop = Math.min(1, novoReemb / ped.valor_total);
    const novaComissao = Math.max(0, round2((ped.comissao_base ?? 0) * (1 - prop)));
    await supabase.from("pedidos").update({ comissao: novaComissao, valor_reembolsado: novoReemb }).eq("id", ped.id);
  }
  // designers do pedido (proporção geral)
  const { data: pds } = await supabase.from("pedidos_designer").select("id, valor_item, comissao_base, valor_reembolsado").eq("shopify_order_id", oid);
  for (const pd of pds ?? []) {
    const prop = Math.min(1, valorReembolsado / total);
    const novoReemb = round2((pd.valor_reembolsado ?? 0) + round2(pd.valor_item * prop));
    const novaComissao = Math.max(0, round2((pd.comissao_base ?? 0) * (1 - Math.min(1, novoReemb / pd.valor_item))));
    await supabase.from("pedidos_designer").update({ comissao: novaComissao, valor_reembolsado: novoReemb }).eq("id", pd.id);
  }
  await supabase.from("refunds_processados").insert({ shopify_refund_id: refundId, shopify_order_id: oid });
  return "aplicado";
}

console.log("\n=== REEMBOLSOS ===");
console.log("  TEST-1006 parcial R$500:", await aplicarReembolso("TEST-1006", "RF-1006", 500, 1000));
console.log("  TEST-1009 total R$400:  ", await aplicarReembolso("TEST-1009", "RF-1009", 400, 400));
console.log("  TEST-1009 REENVIO (idempotência):", await aplicarReembolso("TEST-1009", "RF-1009", 400, 400));

// ── Pagamentos ──────────────────────────────────────────────────────────
console.log("\n=== PAGAMENTOS ===");
await ins("pagamentos", [
  { afiliada_id: id.bia, valor: 50, mes_referencia: MES, observacao: "[TESTE] adiantamento parcial", pago_em: dia(17) },
  { afiliada_id: id.duda, valor: 184, mes_referencia: MES, observacao: "[TESTE] quitação total", pago_em: dia(18) },
]);
await ins("pagamentos_designer", [
  { designer_id: id.studioA, valor: 100, mes_referencia: MES, observacao: "[TESTE] parcial", pago_em: dia(18) },
]);

console.log("\n✅ SEED CONCLUÍDO");
