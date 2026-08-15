// Varre pedidos antigos na Shopify e preenche comissões de influencer que ficaram de fora
// (ex: cupom já tinha vendas antes da influencer ser cadastrada no app).
// Seguro rodar mais de uma vez: pula pedidos que já existem no banco, não duplica.
//
// Uso: node --env-file=.env scripts/backfill-influencers.mjs [dias]
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
              totalPriceSet { shopMoney { amount } }
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

console.log(`=== BACKFILL INFLUENCERS (últimos ${dias} dias) ===`);

const { shop, accessToken } = await getCredenciais();
console.log(`Loja: ${shop}`);

const { data: afiliadas } = await supabase
  .from("afiliadas")
  .select("id, nome, cupom, percentual")
  .eq("ativo", true);

if (!afiliadas || afiliadas.length === 0) {
  console.log("Nenhuma influencer ativa cadastrada. Nada a fazer.");
  process.exit(0);
}

const afiliadaPorCupom = new Map(afiliadas.map((a) => [a.cupom.toUpperCase(), a]));

console.log(`Influencers ativas: ${afiliadas.length} | Buscando pedidos pagos desde ${desde}...`);
const pedidos = await buscarPedidosPagos(shop, accessToken, desde);
console.log(`Pedidos pagos encontrados: ${pedidos.length}`);

// Agrupa pedidos por influencer e ordena por data (crescente) — a comissão por tier
// depende do total acumulado no mês, então precisa processar em ordem cronológica.
const pedidosPorAfiliada = new Map();
for (const pedido of pedidos) {
  if (pedido.cancelledAt) continue;
  const codigos = (pedido.discountCodes ?? []).map((c) => String(c).toUpperCase());
  const codigoUsado = codigos.find((c) => afiliadaPorCupom.has(c));
  if (!codigoUsado) continue;
  const afiliada = afiliadaPorCupom.get(codigoUsado);
  if (!pedidosPorAfiliada.has(afiliada.id)) pedidosPorAfiliada.set(afiliada.id, []);
  pedidosPorAfiliada.get(afiliada.id).push(pedido);
}

let inseridos = 0;
let ignorados = 0;

for (const [afiliadaId, pedidosDaAfiliada] of pedidosPorAfiliada) {
  const afiliada = afiliadas.find((a) => a.id === afiliadaId);
  const percentual = afiliada.percentual ?? 10;
  pedidosDaAfiliada.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  for (const pedido of pedidosDaAfiliada) {
    const shopifyOrderId = String(pedido.id).split("/").pop();

    const { data: existente } = await supabase
      .from("pedidos")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();
    if (existente) { ignorados++; continue; }

    const valorTotal = round2(parseFloat(pedido.totalPriceSet?.shopMoney?.amount ?? "0"));
    const mes = mesReferenciaDe(pedido.createdAt);
    const comissao = round2(valorTotal * (percentual / 100));

    const { error } = await supabase.from("pedidos").insert({
      shopify_order_id: shopifyOrderId,
      afiliada_id: afiliadaId,
      valor_total: valorTotal,
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
      console.log(`  + ${pedido.name} → ${afiliada.nome} (${afiliada.cupom}, ${percentual}%) = R$ ${comissao}`);
      inseridos++;
    }
  }
}

console.log(`\n=== CONCLUÍDO: ${inseridos} comissões inseridas, ${ignorados} já existiam ===`);
