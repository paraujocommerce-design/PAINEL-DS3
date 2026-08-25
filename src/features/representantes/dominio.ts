/**
 * Fonte única das regras determinísticas da frente Representantes.
 * Nenhuma regra aqui pode ser reimplementada em componentes.
 */

export type StatusAtividade = "sem_producao" | "ativo" | "atencao" | "inativo";

export const ROTULO_STATUS: Record<StatusAtividade, string> = {
  sem_producao: "Sem produção",
  ativo: "Ativo",
  atencao: "Atenção",
  inativo: "Inativo",
};

/** Data (YYYY-MM-DD) tratada como data civil, sem fuso. */
export function paraData(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano!, (mes ?? 1) - 1, dia ?? 1));
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function diasEntre(inicioISO: string, fimISO: string): number {
  const ms = paraData(fimISO).getTime() - paraData(inicioISO).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Dias sem venda desde a última produção válida.
 * `null` quando nunca houve produção registrada (ausência ≠ zero).
 */
export function diasSemVenda(ultimaProducao: string | null, referenciaISO: string): number | null {
  if (!ultimaProducao) return null;
  return Math.max(0, diasEntre(ultimaProducao, referenciaISO));
}

/**
 * Regra de atividade: 0–19 ativo, 20–29 atenção, 30+ inativo.
 * Sem produção registrada => estado próprio (não classificado como ativo).
 */
export function calcularStatus(
  ultimaProducao: string | null,
  referenciaISO: string,
): StatusAtividade {
  const dias = diasSemVenda(ultimaProducao, referenciaISO);
  if (dias === null) return "sem_producao";
  if (dias >= 30) return "inativo";
  if (dias >= 20) return "atencao";
  return "ativo";
}

/** Período mensal no formato YYYY-MM. */
export function periodoAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function limitesDoPeriodo(periodo: string): { inicio: string; fim: string } {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano!, (mes ?? 1) - 1, 1));
  const fim = new Date(Date.UTC(ano!, mes ?? 1, 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function rotuloPeriodo(periodo: string): string {
  const { inicio } = limitesDoPeriodo(periodo);
  return paraData(inicio).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return paraData(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Produção média por representante que produziu.
 * Só existe se o denominador for maior que zero.
 */
export function producaoMedia(contratos: number, representantesComProducao: number): number | null {
  if (representantesComProducao <= 0) return null;
  return contratos / representantesComProducao;
}

/** Atingimento (%) só é calculável com meta cadastrada e maior que zero. */
export function atingimento(contratos: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return (contratos / meta) * 100;
}

/** Participação individual (%) na produção do período. */
export function participacao(contratos: number, total: number): number | null {
  if (total <= 0) return null;
  return (contratos / total) * 100;
}

/** Reativação derivada: intervalo mínimo entre produções válidas consecutivas. */
export const JANELA_REATIVACAO_DIAS = 30;

/**
 * Data de referência de um período: hoje (período atual) ou o último dia do
 * período consultado. Produção posterior nunca altera status histórico.
 */
export function referenciaDoPeriodo(periodo: string, hoje = hojeISO()): string {
  const { fim } = limitesDoPeriodo(periodo);
  return hoje < fim ? hoje : fim;
}
