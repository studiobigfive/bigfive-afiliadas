import { supabase } from "./supabase.server";

// Alinhado com a versão estável que o app usa (ApiVersion.October25 em shopify.server.ts).
const API_VERSION = "2025-10";

async function getShopifyCredentials(): Promise<{ shop: string; accessToken: string }> {
  const { data } = await supabase
    .from("Session")
    .select("shop, accessToken")
    .not("accessToken", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!data?.accessToken) {
    throw new Error("Loja não autenticada. Abra o app no painel da Shopify primeiro.");
  }

  return data as { shop: string; accessToken: string };
}

export async function criarCupomShopify(
  codigo: string,
  porcentagem: number
): Promise<{ price_rule_id: number }> {
  const { shop, accessToken } = await getShopifyCredentials();
  const base = `https://${shop}/admin/api/${API_VERSION}`;
  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  // Se houver uma coleção "sem produtos de designer" configurada, o cupom só vale nela —
  // evita pagar comissão de afiliada E de designer no mesmo item.
  const { data: config } = await supabase
    .from("configuracoes_gerais")
    .select("colecao_sem_design_id")
    .eq("id", 1)
    .single();
  const colecaoId = config?.colecao_sem_design_id?.trim() || null;

  // 1. Cria a price rule
  const prRes = await fetch(`${base}/price_rules.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      price_rule: {
        title: codigo,
        target_type: "line_item",
        ...(colecaoId
          ? { target_selection: "entitled", entitled_collection_ids: [Number(colecaoId)] }
          : { target_selection: "all" }),
        allocation_method: "across",
        value_type: "percentage",
        value: `-${porcentagem}.0`,
        customer_selection: "all",
        starts_at: new Date().toISOString(),
      },
    }),
  });

  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({})) as any;
    const msg = err.errors ? JSON.stringify(err.errors) : `HTTP ${prRes.status}`;
    throw new Error(`Erro ao criar desconto na Shopify: ${msg}`);
  }

  const { price_rule } = await prRes.json();

  // 2. Cria o código de desconto vinculado à price rule
  const dcRes = await fetch(`${base}/price_rules/${price_rule.id}/discount_codes.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ discount_code: { code: codigo } }),
  });

  if (!dcRes.ok) {
    const err = await dcRes.json().catch(() => ({})) as any;
    const msg = err.errors ? JSON.stringify(err.errors) : `HTTP ${dcRes.status}`;
    throw new Error(`Erro ao criar código de cupom na Shopify: ${msg}`);
  }

  return { price_rule_id: price_rule.id };
}

export async function buscarProdutos(query: string): Promise<Array<{ id: string; title: string; image: string | null }>> {
  const { shop, accessToken } = await getShopifyCredentials();

  // Busca parcial: cada palavra vira title:*palavra* (casa "Futura MILF" mesmo sem título exato).
  const termos = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `title:*${t.replace(/[\\"]/g, "")}*`)
    .join(" AND ");

  const gql = `
    query buscarProdutos($q: String!) {
      products(first: 10, query: $q) {
        edges {
          node {
            id
            title
            featuredImage { url }
          }
        }
      }
    }`;

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: gql, variables: { q: termos } }),
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error(`[buscarProdutos] HTTP ${res.status}: ${corpo}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error("Sem permissão para ver produtos (a loja precisa aprovar o acesso a produtos).");
    }
    if (res.status === 404) {
      throw new Error(`Endpoint não encontrado (versão da API ${API_VERSION}).`);
    }
    throw new Error(`Erro da Shopify: HTTP ${res.status}`);
  }

  const json = (await res.json()) as any;
  if (json.errors) {
    console.error("[buscarProdutos] GraphQL errors:", JSON.stringify(json.errors));
    const msg = json.errors?.[0]?.message ?? "erro desconhecido";
    throw new Error(`Shopify recusou a busca: ${msg}`);
  }

  const edges = json.data?.products?.edges ?? [];
  return edges.map((e: any) => ({
    // ID numérico (gid://shopify/Product/123 → "123") para casar com product_id dos webhooks
    id: String(e.node.id).split("/").pop() as string,
    title: e.node.title as string,
    image: (e.node.featuredImage?.url ?? null) as string | null,
  }));
}

export async function verificarCupomShopify(codigo: string): Promise<boolean> {
  const { shop, accessToken } = await getShopifyCredentials();
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/discount_codes/lookup.json?code=${encodeURIComponent(codigo)}`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  return res.ok;
}
