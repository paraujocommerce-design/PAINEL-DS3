import type { Contrato, MetaPrefeitura, Movimento, Oportunidade } from "./api";
import {
  ETAPAS,
  atingimento,
  conversao,
  diasParado,
  media,
  situacaoPrazo,
  type Etapa,
  type SituacaoPrazo,
} from "./dominio";

export type LinhaOportunidade = {
  oportunidade: Oportunidade;
  diasNaEtapa: number | null;
  diasParado: number | null;
  situacaoPrazo: SituacaoPrazo;
};

export type IndicadoresPrefeituras = {
  linhas: LinhaOportunidade[];
  funil: Array<{ etapa: Etapa; quantidade: number }>;
  carteira: {
    abertas: number;
    esperaInterna: number;
    esperaExterna: number;
    vencidas: number;
    venceHoje: number;
    semPrazo: number;
    tempoMedioNaEtapa: number | null;
  };
  periodo: {
    ganhas: number;
    perdidas: number;
    reaberturas: number;
    avancos: number;
    conversao: number | null;
  };
  contratos: {
    novas: number;
    renovacoes: number;
    metaNovas: number | null;
    metaRenovacoes: number | null;
    atingimentoNovas: number | null;
    atingimentoRenovacoes: number | null;
  };
};

function metaVigente(
  metas: MetaPrefeitura[],
  indicador: MetaPrefeitura["indicador"],
): number | null {
  const encontrada = metas
    .filter((meta) => meta.indicador === indicador)
    .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
  return encontrada ? encontrada.valor : null;
}

/**
 * Deriva todos os indicadores da frente a partir das views do banco.
 * Nenhum indicador é inventado: ausência de base retorna `null`.
 */
export function derivarIndicadores(entrada: {
  oportunidades: Oportunidade[];
  contratos: Contrato[];
  movimentos: Movimento[];
  metas: MetaPrefeitura[];
  referenciaISO: string;
  intervalo: { inicio: string; fim: string };
}): IndicadoresPrefeituras {
  const { oportunidades, contratos, movimentos, metas, referenciaISO, intervalo } = entrada;

  const abertas = oportunidades.filter((item) => item.status === "aberta");

  const linhas: LinhaOportunidade[] = oportunidades.map((oportunidade) => ({
    oportunidade,
    diasNaEtapa: diasParado(oportunidade.etapa_desde, referenciaISO),
    diasParado: diasParado(oportunidade.ultima_movimentacao, referenciaISO),
    situacaoPrazo: situacaoPrazo(oportunidade.prazo, referenciaISO),
  }));

  const funil = ETAPAS.map((etapa) => ({
    etapa,
    quantidade: abertas.filter((item) => item.etapa_atual === etapa).length,
  }));

  const diasNaEtapa = linhas
    .filter((linha) => linha.oportunidade.status === "aberta" && linha.diasNaEtapa !== null)
    .map((linha) => linha.diasNaEtapa!);

  const encerradasNoPeriodo = oportunidades.filter(
    (item) =>
      item.encerrada_em !== null &&
      item.encerrada_em >= intervalo.inicio &&
      item.encerrada_em <= intervalo.fim,
  );
  const ganhas = encerradasNoPeriodo.filter((item) => item.status === "ganha").length;
  const perdidas = encerradasNoPeriodo.filter((item) => item.status === "perdida").length;

  const novas = contratos.filter((contrato) => contrato.tipo === "nova").length;
  const renovacoes = contratos.filter((contrato) => contrato.tipo === "renovacao").length;
  const metaNovas = metaVigente(metas, "novas_prefeituras_mes");
  const metaRenovacoes = metaVigente(metas, "renovacoes_prefeituras_mes");

  return {
    linhas,
    funil,
    carteira: {
      abertas: abertas.length,
      esperaInterna: abertas.filter((item) => item.tipo_espera === "interna").length,
      esperaExterna: abertas.filter((item) => item.tipo_espera === "externa").length,
      vencidas: linhas.filter(
        (linha) => linha.oportunidade.status === "aberta" && linha.situacaoPrazo === "vencido",
      ).length,
      venceHoje: linhas.filter(
        (linha) => linha.oportunidade.status === "aberta" && linha.situacaoPrazo === "hoje",
      ).length,
      semPrazo: linhas.filter(
        (linha) => linha.oportunidade.status === "aberta" && linha.situacaoPrazo === "sem_prazo",
      ).length,
      tempoMedioNaEtapa: media(
        diasNaEtapa.reduce((total, dias) => total + dias, 0),
        diasNaEtapa.length,
      ),
    },
    periodo: {
      ganhas,
      perdidas,
      reaberturas: movimentos.filter((movimento) => movimento.tipo === "reabertura").length,
      avancos: movimentos.filter((movimento) => movimento.tipo === "avanco").length,
      conversao: conversao(ganhas, perdidas),
    },
    contratos: {
      novas,
      renovacoes,
      metaNovas,
      metaRenovacoes,
      atingimentoNovas: atingimento(novas, metaNovas),
      atingimentoRenovacoes: atingimento(renovacoes, metaRenovacoes),
    },
  };
}
