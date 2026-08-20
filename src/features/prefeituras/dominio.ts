/**
 * Fonte única das regras determinísticas da frente Prefeituras.
 * Nenhuma regra aqui pode ser reimplementada em componentes.
 * Ausência de dado nunca é convertida em zero.
 */

export const ETAPAS = [
  "prospeccao",
  "contato",
  "diagnostico",
  "decisor",
  "apresentacao",
  "interesse",
  "processo_institucional",
  "negociacao",
  "contrato",
] as const;

export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_ETAPA: Record<Etapa, string> = {
  prospeccao: "Prospecção",
  contato: "Contato",
  diagnostico: "Diagnóstico",
  decisor: "Decisor",
  apresentacao: "Apresentação",
  interesse: "Interesse",
  processo_institucional: "Processo institucional",
  negociacao: "Negociação",
  contrato: "Contrato",
};

export type StatusOportunidade = "aberta" | "ganha" | "perdida";

export const ROTULO_STATUS: Record<StatusOportunidade, string> = {
  aberta: "Aberta",
  ganha: "Ganha",
  perdida: "Perdida",
};

export type TipoEspera = "interna" | "externa";

/**
 * Estado de espera da oportunidade aberta.
 * `null` = em andamento (sem espera). Nunca é convertido em "aguardando".
 */
export const ROTULO_ESPERA: Record<TipoEspera, string> = {
  interna: "Aguardando interno",
  externa: "Aguardando externo",
};

export const EM_ANDAMENTO = "Em andamento";

export function rotuloEspera(tipo: TipoEspera | null): string {
  return tipo ? ROTULO_ESPERA[tipo] : EM_ANDAMENTO;
}

export const OPCOES_ESPERA = [
  { value: "", label: EM_ANDAMENTO },
  { value: "interna", label: ROTULO_ESPERA.interna },
  { value: "externa", label: ROTULO_ESPERA.externa },
] as const;

export const TIPOS_INTERACAO = [
  { value: "contato", label: "Contato" },
  { value: "reuniao", label: "Reunião" },
  { value: "proposta", label: "Proposta comercial" },
  { value: "follow_up", label: "Follow-up" },
  { value: "observacao", label: "Observação" },
] as const;

export const ROTULO_MOVIMENTO: Record<string, string> = {
  abertura: "Abertura",
  avanco: "Avanço",
  retrocesso: "Retrocesso",
  ganho: "Ganho (contrato)",
  perda: "Perda",
  reabertura: "Reabertura",
  atualizacao_proximo_passo: "Atualização do próximo passo",
};

/** Etapa CONTRATO nunca é escolhida como movimento: decorre do fechamento. */
export function etapasSelecionaveis(): Etapa[] {
  return ETAPAS.filter((etapa) => etapa !== "contrato");
}

export function ordemEtapa(etapa: string): number {
  const indice = ETAPAS.indexOf(etapa as Etapa);
  return indice < 0 ? Number.NaN : indice + 1;
}

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

export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return paraData(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

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

/** Data de referência: hoje no período corrente; fim do período em consultas passadas. */
export function referenciaDoPeriodo(periodo: string, hoje = hojeISO()): string {
  const { fim } = limitesDoPeriodo(periodo);
  return hoje < fim ? hoje : fim;
}

export type SituacaoPrazo = "vencido" | "hoje" | "em_dia" | "sem_prazo";

export const ROTULO_PRAZO: Record<SituacaoPrazo, string> = {
  vencido: "Prazo vencido",
  hoje: "Vence hoje",
  em_dia: "Em dia",
  sem_prazo: "Sem prazo",
};

/** Situação do próximo movimento em relação à data de referência. */
export function situacaoPrazo(prazo: string | null, referenciaISO: string): SituacaoPrazo {
  if (!prazo) return "sem_prazo";
  const dias = diasEntre(referenciaISO, prazo);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  return "em_dia";
}

/** Dias parados: desde a última movimentação registrada. `null` sem data. */
export function diasParado(
  ultimaMovimentacao: string | null,
  referenciaISO: string,
): number | null {
  if (!ultimaMovimentacao) return null;
  return Math.max(0, diasEntre(ultimaMovimentacao, referenciaISO));
}

/** Atingimento (%) só existe com meta cadastrada maior que zero. */
export function atingimento(realizado: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return (realizado / meta) * 100;
}

/** Conversão (%) só existe com oportunidades encerradas no período. */
export function conversao(ganhas: number, perdidas: number): number | null {
  const encerradas = ganhas + perdidas;
  if (encerradas <= 0) return null;
  return (ganhas / encerradas) * 100;
}

/** Média só existe com denominador maior que zero. */
export function media(total: number, quantidade: number): number | null {
  if (quantidade <= 0) return null;
  return total / quantidade;
}
