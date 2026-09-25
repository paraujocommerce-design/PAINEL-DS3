/**
 * Tipos centralizados para o módulo de Pagamentos
 * Remove type coercion com 'any' em dashboard-acoes e saldo-representante
 */

export type Tab = "aceitas" | "pendentes" | "recusadas";

export interface AcaoPendente {
  id: string;
  ordem_id: string;
  tipo: "autorizacao_pendente" | "pagamento_pendente";
  representante_codigo: string;
  representante_nome: string;
  data_ordem: string;
  status: string;
  prioridade: "alta" | "média" | "baixa";
}

export interface SaldoLinhaRelatorio {
  data_referencia: string;
  rubrica: string;
  codigo_contrato: string | null;
  valor_liquido: number;
  status: string;
}

export interface SaldoRepresentanteDetalhado {
  representante_id: string;
  representante_codigo: string;
  representante_nome: string;
  total_a_receber: number;
  total_pago: number;
  saldo_devedor: number;
  saldo_liquido: number;
}

export interface ExtratoBlocos {
  data_ordem: string;
  descricao: string;
  tipo: "crédito" | "débito";
  valor: number;
  status: string;
}
