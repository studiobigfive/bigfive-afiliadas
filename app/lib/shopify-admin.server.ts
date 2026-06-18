import { supabase } from "./supabase.server";

const API_VERSION = "2025-01";

async function getShopifyCredentials(): Promise<{ shop: string; accessToken: string }> {
  const { data } = await supabase
    .from("Session")
    .select("shop, accessToken")
    .not("accessToken", "is", null)
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

  // 1. Cria a price rule
  const prRes = await fetch(`${base}/price_rules.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      price_rule: {
        title: codigo,
        target_type: "line_item",
        target_selection: "all",
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

export async function verificarCupomShopify(codigo: string): Promise<boolean> {
  const { shop, accessToken } = await getShopifyCredentials();
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/discount_codes/lookup.json?code=${encodeURIComponent(codigo)}`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  return res.ok;
}
