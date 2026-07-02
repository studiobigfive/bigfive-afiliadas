// Varre pedidos antigos na Shopify e preenche comissões de designer que ficaram de fora
// (ex: produto vinculado depois que a venda já tinha acontecido).
// Seguro rodar mais de uma vez: usa o mesmo upsert (onConflict) do webhook, não duplica.
//
// Uso: node --env-file=.env scripts/backfill-designers.mjs [dias]
// Padrão: últimos 90 dias.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_VERSION = "2025-10";
const round2 = (v) => Math.round(v * 100) / 100;

function mesReferenciaDe(dataISO) {
  const partes = new Date(dataISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
  const [m, a] = partes.split("/");
  return `${a}-${m}`;
}

const dias = parseInt(process.argv[2] || "90", 10);
const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

async function getCredenciais() {
  const { data } = await supabase
    .from("Session")
    .select("shop, accessToken")
    .not("accessToken", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .single();
  if (!data?.accessToken) throw new Error("Loja não autenticada.");
  return data;
}

async function buscarPedidosPagos(shop, accessToken, desdeISO) {
  const headers = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  let pedidos = [];
  let cursor = null;
  let paginas = 0;

  while (paginas < 20) { // trava de segurança
    const gql = `
      query pedidos($q: String!, $cursor: String) {
        orders(first: 50, after: $cursor, query: $q) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node {
              id
              name
              createdAt
              cancelledAt
              discountCodes
              lineItems(first: 50) {
                edges {
                  node {
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                    product { id }
                  }
                }
              }
            }
          }
        }
      }`;
    const q = `financial_status:paid AND created_at:>=${desdeISO}`;
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gql, variables: { q, cursor } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);

    const edges = json.data?.orders?.edges ?? [];
    pedidos.push(...edges.map((e) => e.node));
    if (!json.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
    paginas++;
  }
  return pedidos;
}

console.log(`=== BACKFILL DESIGNERS (últimos ${dias} dias) ===`);

const { shop, accessToken } = await getCredenciais();
console.log(`Loja: ${shop}`);

const { data: designers } = await supabase
  .from("designers")
  .select("id, nome, percentual, cupom, ativo")
  .eq("ativo", true);

const { data: vinculos } = await supabase
  .from("designer_produtos")
  .select("designer_id, shopify_product_id, nome_produto");

const designerById = new Map((designers ?? []).map((d) => [d.id, d]));
const vinculosPorProduto = new Map();
for (const v of vinculos ?? []) {
  if (!vinculosPorProduto.has(v.shopify_product_id)) vinculosPorProduto.set(v.shopify_product_id, []);
  vinculosPorProduto.get(v.shopify_product_id).push(v);
}

if (vinculosPorProduto.size === 0) {
  console.log("Nenhum produto vinculado a designers. Nada a fazer.");
  process.exit(0);
}

console.log(`Produtos vinculados: ${vinculosPorProduto.size} | Buscando pedidos pagos desde ${desde}...`);
const pedidos = await buscarPedidosPagos(shop, accessToken, desde);
console.log(`Pedidos pagos encontrados: ${pedidos.length}`);

let inseridos = 0;
let ignorados = 0;

for (const pedido of pedidos) {
  if (pedido.cancelledAt) continue;
  const shopifyOrderId = String(pedido.id).split("/").pop();
  const discountCodes = (pedido.discountCodes ?? []).map((c) => String(c).toUpperCase());
  const mes = mesReferenciaDe(pedido.createdAt);

  // Agrupa as linhas do pedido por produto primeiro (um produto pode aparecer em
  // mais de uma linha — ex: cliente levou P e M da mesma estampa)
  const valorPorProduto = new Map();
  for (const liEdge of pedido.lineItems.edges) {
    const li = liEdge.node;
    const productGid = li.product?.id;
    if (!productGid) continue;
    const productId = String(productGid).split("/").pop();
    const preco = parseFloat(li.originalUnitPriceSet?.shopMoney?.amount ?? "0");
    const valor = preco * (li.quantity ?? 1);
    valorPorProduto.set(productId, (valorPorProduto.get(productId) ?? 0) + valor);
  }

  for (const [productId, valorBruto] of valorPorProduto) {
    const vinculosDoProduto = vinculosPorProduto.get(productId);
    if (!vinculosDoProduto) continue;
    const valorItem = round2(valorBruto);

    for (const v of vinculosDoProduto) {
      const d = designerById.get(v.designer_id);
      if (!d?.ativo) continue;
      if (d.cupom && discountCodes.includes(String(d.cupom).toUpperCase())) continue; // não duplica

      const comissao = round2(valorItem * (d.percentual / 100));

      // Já existe? (evita contar de novo mesmo sem depender só do upsert)
      const { data: existente } = await supabase
        .from("pedidos_designer")
        .select("id")
        .eq("shopify_order_id", shopifyOrderId)
        .eq("designer_id", d.id)
        .eq("shopify_product_id", productId)
        .maybeSingle();

      if (existente) { ignorados++; continue; }

      const { error } = await supabase.from("pedidos_designer").insert({
        shopify_order_id: shopifyOrderId,
        designer_id: d.id,
        shopify_product_id: productId,
        nome_produto: v.nome_produto || "",
        valor_item: valorItem,
        comissao,
        comissao_base: comissao,
        valor_reembolsado: 0,
        mes_referencia: mes,
        cancelado: false,
        criado_em: pedido.createdAt,
      });
      if (error) {
        console.log(`  ERRO pedido ${pedido.name}: ${error.message}`);
      } else {
        console.log(`  + ${pedido.name} → ${d.nome} (${v.nome_produto}) = R$ ${comissao}`);
        inseridos++;
      }
    }
  }
}

console.log(`\n=== CONCLUÍDO: ${inseridos} comissões inseridas, ${ignorados} já existiam ===`);
