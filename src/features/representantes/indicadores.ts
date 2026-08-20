import type {
  CaptacaoAtribuida,
  Meta,
  ProducaoAtribuida,
  ReativacaoDerivada,
  RepresentanteCarteira,
} from "./api";
import {
  atingimento,
  calcularStatus,
  diasSemVenda,
  participacao,
  producaoMedia,
  type StatusAtividade,
} from "./dominio";

export type LinhaRepresentante = {
  representante: RepresentanteCarteira;
  status: StatusAtividade;
  diasSemVenda: number | null;
  contratosPeriodo: number;
  participacao: number | null;
  reativadoNoPeriodo: boolean;
};

export type Indicadores = {
  linhas: LinhaRepresentante[];
  resultado: {
    contratos: number;
    meta: number | null;
    atingimento: number | null;
    diferenca: number | null;
  };
  rede: {
    total: number;
    ativos: number;
    atencao: number;
    inativos: number;
    semProducao: number;
    captadosNoPeriodo: number;
    reativacoesNoPeriodo: number;
    metaAtivos: number | null;
  };
  producao: {
    representantesComProducao: number;
    contratos: number;
    media: number | null;
    primeiraVendaNoPeriodo: number;
  };
};

/**
 * Derivação única dos indicadores da frente, a partir dos dados reais.
 * Produções já chegam atribuídas ao supervisor vigente na data do fato e
 * sem canceladas; reativações vêm da view derivada. Nenhum componente recalcula.
 */
export function derivarIndicadores(entrada: {
  representantes: RepresentanteCarteira[];
  producoes: ProducaoAtribuida[];
  reativacoes: ReativacaoDerivada[];
  captacoes: CaptacaoAtribuida[];
  metas: Meta[];
  referenciaISO: string;
}): Indicadores {
  const contratosPorRepresentante = new Map<string, number>();
  for (const producao of entrada.producoes) {
    contratosPorRepresentante.set(
      producao.representante_id,
      (contratosPorRepresentante.get(producao.representante_id) ?? 0) + producao.quantidade,
    );
  }

  const contratos = [...contratosPorRepresentante.values()].reduce((a, b) => a + b, 0);
  const representantesComProducao = [...contratosPorRepresentante.values()].filter(
    (valor) => valor > 0,
  ).length;

  const reativados = new Set(entrada.reativacoes.map((r) => r.representante_id));

  const linhas: LinhaRepresentante[] = entrada.representantes.map((representante) => {
    const contratosPeriodo = contratosPorRepresentante.get(representante.id) ?? 0;
    return {
      representante,
      status: calcularStatus(representante.ultima_producao, entrada.referenciaISO),
      diasSemVenda: diasSemVenda(representante.ultima_producao, entrada.referenciaISO),
      contratosPeriodo,
      participacao: participacao(contratosPeriodo, contratos),
      reativadoNoPeriodo: reativados.has(representante.id),
    };
  });

  const contar = (status: StatusAtividade) => linhas.filter((l) => l.status === status).length;

  const metaContratos = metaVigente(entrada.metas, "contratos_mes");
  const metaAtivos = metaVigente(entrada.metas, "representantes_ativos");

  // Primeira venda no período: todo o histórico válido até a referência
  // coincide com o produzido dentro do período consultado.
  const primeiraVendaNoPeriodo = entrada.representantes.filter((representante) => {
    const noPeriodo = contratosPorRepresentante.get(representante.id) ?? 0;
    const ateReferencia = representante.contratos_ate_referencia;
    return noPeriodo > 0 && ateReferencia !== null && ateReferencia === noPeriodo;
  }).length;

  return {
    linhas,
    resultado: {
      contratos,
      meta: metaContratos,
      atingimento: atingimento(contratos, metaContratos),
      diferenca: metaContratos === null ? null : contratos - metaContratos,
    },
    rede: {
      total: linhas.length,
      ativos: contar("ativo"),
      atencao: contar("atencao"),
      inativos: contar("inativo"),
      semProducao: contar("sem_producao"),
      captadosNoPeriodo: entrada.captacoes.length,
      reativacoesNoPeriodo: entrada.reativacoes.length,
      metaAtivos,
    },
    producao: {
      representantesComProducao,
      contratos,
      media: producaoMedia(contratos, representantesComProducao),
      primeiraVendaNoPeriodo,
    },
  };
}

/** Meta em vigor: a vigência mais recente já iniciada. Sem cadastro => null. */
export function metaVigente(metas: Meta[], indicador: Meta["indicador"]): number | null {
  const candidatas = metas
    .filter((meta) => meta.indicador === indicador)
    .sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1));
  return candidatas.length > 0 ? Number(candidatas[0]!.valor) : null;
}
