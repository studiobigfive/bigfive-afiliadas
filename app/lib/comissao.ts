export function mesAtual(): string {
  const partes = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
  // partes = "MM/AAAA"
  const [m, a] = partes.split("/");
  return `${a}-${m}`;
}
