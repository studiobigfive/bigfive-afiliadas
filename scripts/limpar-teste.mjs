import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Ordem: filhos antes dos pais (por causa das foreign keys).
// NÃO inclui tiers_comissao (config) nem Session (tokens de conexão).
const plano = [
  { t: "pedidos", pk: "id" },
  { t: "pedidos_designer", pk: "id" },
  { t: "pagamentos", pk: "id" },
  { t: "pagamentos_designer", pk: "id" },
  { t: "designer_produtos", pk: "id" },
  { t: "refunds_processados", pk: "shopify_refund_id" },
  { t: "afiliadas", pk: "id" },
  { t: "designers", pk: "id" },
];

console.log("=== LIMPANDO DADOS DE TESTE ===");
for (const { t, pk } of plano) {
  const { data, error } = await supabase.from(t).delete().not(pk, "is", null).select(pk);
  if (error) console.log(`  [${t}] ERRO: ${error.message}`);
  else console.log(`  [${t}] deletadas: ${data?.length ?? 0}`);
}

console.log("\n=== CONFIRMAÇÃO (linhas restantes) ===");
for (const { t } of plano) {
  const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(`  [${t}] = ${count}`);
}
const { count: tc } = await supabase.from("tiers_comissao").select("*", { count: "exact", head: true });
console.log(`  [tiers_comissao] = ${tc}  (preservado ✓)`);
