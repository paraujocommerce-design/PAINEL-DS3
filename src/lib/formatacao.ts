/**
 * Funções centralizadas de formatação
 * Evita duplicação entre módulos
 */

export function moeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(iso: string): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function paraData(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function periodoAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function limitesDoPeriodo(periodo: string): { inicio: string; fim: string } {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano!, mes! - 1, 1));
  const fim = new Date(Date.UTC(ano!, mes!, 0));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

export function rotuloPeriodo(periodo: string): string {
  const [ano, mes] = periodo.split("-").map(Number);
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[mes! - 1]} ${ano}`;
}

export function dataAtualISO(): string {
  return new Date().toISOString().slice(0, 10);
}
