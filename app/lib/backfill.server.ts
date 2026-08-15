// Recupera vendas antigas na Shopify que aconteceram ANTES de uma influencer/designer
// ser cadastrada no app (ou antes de um produto ser vinculado a um designer).
// Chamado automaticamente na hora do cadastro/vínculo — não precisa rodar manualmente.

import { supabase } from "./supabase.server";
import { getShopifyCredentials } from "./shopify-admin.server";

const API_VERSION = "2025-10";
const DIAS_PADRAO = 90;
const round2 = (v: number) => Math.round(v * 100) / 100;

function mesReferenciaDe(dataISO: string): string {
  const partes = new Date(dataISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
  const [m, a] = partes.split("/");
  return `${a}-${m}`;
}

async function buscarPedidosPagos(shop: string, accessToken: string, desdeISO: string, camposExtra: string) {
  const headers = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  let pedidos: any[] = [];
  let cursor: string | null = null;
  let paginas = 0;

  while (paginas < 20) {
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
              ${camposExtra}
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
    const json: any = await res.json();
    if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);

    const edges = json.data?.orders?.edges ?? [];
    pedidos.push(...edges.map((e: any) => e.node));
    if (!json.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
    paginas++;
  }
  return pedidos;
}

/** Roda assim que uma influencer é cadastrada com um cupom que já tinha vendas anteriores. */
export async function backfillInfluencer(afiliadaId: string, cupom: string, dias = DIAS_PADRAO): Promise<{ inseridos: number }> {
  const { shop, accessToken } = await getShopifyCredentials();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const cupomUpper = cupom.toUpperCase();

  const pedidos = await buscarPedidosPagos(shop, accessToken, desde, "totalPriceSet { shopMoney { amount } }");
  const pedidosDoCupom = pedidos
    .filter((p) => !p.cancelledAt && (p.discountCodes ?? []).map((c: string) => String(c).toUpperCase()).includes(cupomUpper))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (pedidosDoCupom.length === 0) return { inseridos: 0 };

  const { data: tiers } = await supabase.from("tiers_comissao").select("vendas_ate, percentual").order("vendas_ate", { ascending: true, nullsFirst: false });
  const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => {
    if (a.vendas_ate == null) return 1;
    if (b.vendas_ate == null) return -1;
    return a.vendas_ate - b.vendas_ate;
  });
  const achaTier = (novoTotal: number) => tiersOrdenados.find((t) => t.vendas_ate == null || novoTotal <= t.vendas_ate) ?? { percentual: 10 };

  const { data: existentesDoMes } = await supabase.from("pedidos").select("mes_referencia, valor_total").eq("afiliada_id", afiliadaId).eq("cancelado", false);
  const acumuladoPorMes: Record<string, number> = {};
  for (const p of existentesDoMes ?? []) acumuladoPorMes[p.mes_referencia] = (acumuladoPorMes[p.mes_referencia] ?? 0) + p.valor_total;

  let inseridos = 0;
  for (const pedido of pedidosDoCupom) {
    const shopifyOrderId = String(pedido.id).split("/").pop();
    const { data: existente } = await supabase.from("pedidos").select("id").eq("shopify_order_id", shopifyOrderId).maybeSingle();
    if (existente) continue;

    const valorTotal = round2(parseFloat(pedido.totalPriceSet?.shopMoney?.amount ?? "0"));
    const mes = mesReferenciaDe(pedido.createdAt);
    const novoTotal = (acumuladoPorMes[mes] ?? 0) + valorTotal;
    const tier = achaTier(novoTotal);
    const comissao = round2(valorTotal * (tier.percentual / 100));

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
    if (!error) {
      acumuladoPorMes[mes] = novoTotal;
      inseridos++;
    } else {
      console.error(`[backfill] erro ao inserir pedido ${pedido.name} (influencer):`, error.message);
    }
  }
  return { inseridos };
}

/** Roda assim que um produto é vinculado a um designer, pra recuperar vendas anteriores dele. */
export async function backfillProdutoDesigner(
  designerId: string,
  shopifyProductId: string,
  nomeProduto: string,
  percentual: number,
  cupomDesigner: string | null,
  dias = DIAS_PADRAO
): Promise<{ inseridos: number }> {
  const { shop, accessToken } = await getShopifyCredentials();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const pedidos = await buscarPedidosPagos(
    shop,
    accessToken,
    desde,
    "lineItems(first: 50) { edges { node { quantity originalUnitPriceSet { shopMoney { amount } } product { id } } } }"
  );

  let inseridos = 0;
  for (const pedido of pedidos) {
    if (pedido.cancelledAt) continue;
    const discountCodes = (pedido.discountCodes ?? []).map((c: string) => String(c).toUpperCase());
    if (cupomDesigner && discountCodes.includes(cupomDesigner.toUpperCase())) continue; // não duplica com comissão de cupom

    let valorItem = 0;
    for (const liEdge of pedido.lineItems.edges) {
      const li = liEdge.node;
      const productId = li.product?.id ? String(li.product.id).split("/").pop() : null;
      if (productId !== shopifyProductId) continue;
      valorItem += parseFloat(li.originalUnitPriceSet?.shopMoney?.amount ?? "0") * (li.quantity ?? 1);
    }
    if (valorItem <= 0) continue;
    valorItem = round2(valorItem);

    const shopifyOrderId = String(pedido.id).split("/").pop();
    const { data: existente } = await supabase
      .from("pedidos_designer")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .eq("designer_id", designerId)
      .eq("shopify_product_id", shopifyProductId)
      .maybeSingle();
    if (existente) continue;

    const comissao = round2(valorItem * (percentual / 100));
    const { error } = await supabase.from("pedidos_designer").insert({
      shopify_order_id: shopifyOrderId,
      designer_id: designerId,
      shopify_product_id: shopifyProductId,
      nome_produto: nomeProduto,
      valor_item: valorItem,
      comissao,
      comissao_base: comissao,
      valor_reembolsado: 0,
      mes_referencia: mesReferenciaDe(pedido.createdAt),
      cancelado: false,
      criado_em: pedido.createdAt,
    });
    if (!error) inseridos++;
    else console.error(`[backfill] erro ao inserir pedido ${pedido.name} (designer):`, error.message);
  }
  return { inseridos };
}
