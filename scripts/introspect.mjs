import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tabelas = [
  "tiers_comissao", "afiliadas", "designers", "designer_produtos",
  "pedidos", "pedidos_designer", "pagamentos", "pagamentos_designer",
  "refunds_processados",
];

for (const t of tabelas) {
  const { data, error, count } = await supabase.from(t).select("*", { count: "exact" }).limit(1);
  if (error) {
    console.log(`\n[${t}] ERRO: ${error.message}`);
    continue;
  }
  const cols = data && data[0] ? Object.keys(data[0]) : "(vazia — sem amostra de colunas)";
  console.log(`\n[${t}] linhas=${count}`);
  console.log("  colunas:", cols);
}

// tiers não são dados sensíveis — preciso deles pra calcular comissão
const { data: tiers } = await supabase
  .from("tiers_comissao")
  .select("vendas_ate, percentual, label")
  .order("vendas_ate", { ascending: true, nullsFirst: false });
console.log("\nTIERS DE COMISSÃO:", JSON.stringify(tiers, null, 2));
