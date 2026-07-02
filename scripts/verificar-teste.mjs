import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fmt = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const ok = (a, b) => (Math.abs(a - b) < 0.01 ? "✅" : "❌");

const { data: afiliadas } = await supabase.from("afiliadas").select("*").like("nome", "[TESTE]%").order("nome");
const { data: designers } = await supabase.from("designers").select("*").like("nome", "[TESTE]%").order("nome");
const { data: pedidos } = await supabase.from("pedidos").select("*");
const { data: pedDes } = await supabase.from("pedidos_designer").select("*");
const { data: pagAf } = await supabase.from("pagamentos").select("*");
const { data: pagDe } = await supabase.from("pagamentos_designer").select("*");

// Esperados (comissão efetiva — calculados à mão)
const espAfil = { BIA10: 75, DUDA10: 184, LEO10: 390, MANU10: 72, RAFA10: 48 };
const espDes = { "Studio A": 210, "Studio B": 0, "Studio C": 160, "Manu (designer)": 195, "Rafa (designer)": 175 };

console.log("\n══════════ AFILIADAS (comissão por cupom/tier) ══════════");
let totalReceberAf = 0;
for (const a of afiliadas) {
  const meus = pedidos.filter((p) => p.afiliada_id === a.id);
  const comissao = meus.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0);
  const pago = pagAf.filter((p) => p.afiliada_id === a.id).reduce((s, p) => s + p.valor, 0);
  const receber = Math.max(0, comissao - pago);
  totalReceberAf += receber;
  const esp = espAfil[a.cupom];
  console.log(`${ok(comissao, esp)} ${a.cupom.padEnd(7)} comissão=${fmt(comissao).padEnd(12)} (esperado ${fmt(esp)})  pago=${fmt(pago).padEnd(11)} a receber=${fmt(receber)}`);
}

console.log("\n══════════ DESIGNERS (comissão por produto) ══════════");
let totalReceberDe = 0;
for (const d of designers) {
  const meus = pedDes.filter((p) => p.designer_id === d.id);
  const comissao = meus.filter((p) => !p.cancelado).reduce((s, p) => s + p.comissao, 0);
  const pago = pagDe.filter((p) => p.designer_id === d.id).reduce((s, p) => s + p.valor, 0);
  const receber = Math.max(0, comissao - pago);
  totalReceberDe += receber;
  const chave = d.nome.replace("[TESTE] ", "");
  const esp = espDes[chave];
  console.log(`${ok(comissao, esp)} ${chave.padEnd(18)} comissão=${fmt(comissao).padEnd(12)} (esperado ${fmt(esp)})  pago=${fmt(pago).padEnd(11)} a receber=${fmt(receber)}`);
}

console.log("\n══════════ CENÁRIOS-CHAVE (regras especiais) ══════════");
const semDesigner = (oid) => pedDes.filter((p) => p.shopify_order_id === oid).length === 0;
const semAfiliada = (oid) => pedidos.filter((p) => p.shopify_order_id === oid).length === 0;
const ped = (oid) => pedidos.find((p) => p.shopify_order_id === oid);

console.log(`${semDesigner("TEST-1012") ? "✅" : "❌"} Não-sobreposição: cupom MANU10 no produto da Manu → design NÃO duplica (0 registros de designer)`);
console.log(`${semDesigner("TEST-1014") ? "✅" : "❌"} Não-sobreposição: cupom RAFA10 no produto da Rafa → design NÃO duplica`);
console.log(`${semDesigner("TEST-1010") && semAfiliada("TEST-1010") ? "✅" : "❌"} Cupom do próprio designer (STUDIOB, não-afiliada) → ninguém recebe comissão`);
console.log(`${pedDes.some((p) => p.shopify_order_id === "TEST-1013") ? "✅" : "❌"} Cupom MANU10 + produto de OUTRO designer (Studio A) → os dois recebem`);
console.log(`${ped("TEST-1011")?.cancelado ? "✅" : "❌"} Pedido cancelado (TEST-1011) marcado e excluído do tier do Léo`);
const r1006 = ped("TEST-1006");
console.log(`${ok(r1006?.comissao, 50)} Reembolso parcial 50% (TEST-1006): comissão ${fmt(r1006?.comissao)} (base ${fmt(r1006?.comissao_base)}, esperado R$ 50,00)`);
const r1009 = ped("TEST-1009");
console.log(`${ok(r1009?.comissao, 0)} Reembolso total (TEST-1009): comissão ${fmt(r1009?.comissao)} (esperado R$ 0,00)`);
const { count: nRefunds } = await supabase.from("refunds_processados").select("*", { count: "exact", head: true });
console.log(`${nRefunds === 2 ? "✅" : "❌"} Idempotência: ${nRefunds} reembolsos registrados (reenvio do RF-1009 foi ignorado, não reduziu 2x)`);

console.log("\n══════════ TOTAIS (dashboard) ══════════");
console.log(`A pagar afiliadas: ${fmt(totalReceberAf)}  (esperado R$ 535,00) ${ok(totalReceberAf, 535)}`);
console.log(`A pagar designers: ${fmt(totalReceberDe)}  (esperado R$ 640,00) ${ok(totalReceberDe, 640)}`);
console.log(`TOTAL GERAL:       ${fmt(totalReceberAf + totalReceberDe)}  (esperado R$ 1.175,00) ${ok(totalReceberAf + totalReceberDe, 1175)}`);
