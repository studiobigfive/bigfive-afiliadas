export type Tier = { vendas_ate: number | null; percentual: number };

export function calcularComissao(totalVendas: number, tiers: Tier[]): number {
  const sorted = [...tiers].sort((a, b) => (a.vendas_ate ?? Infinity) - (b.vendas_ate ?? Infinity));

  let comissao = 0;
  let restante = totalVendas;
  let anterior = 0;

  for (const tier of sorted) {
    const limite = tier.vendas_ate ?? Infinity;
    const faixa = Math.min(restante, limite - anterior);
    if (faixa <= 0) break;
    comissao += faixa * (tier.percentual / 100);
    restante -= faixa;
    anterior = limite;
    if (restante <= 0) break;
  }

  return Math.round(comissao * 100) / 100;
}

export function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
