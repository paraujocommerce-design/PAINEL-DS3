import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function texto(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

export type StatusOrdem = "aberta" | "fechada" | "paga" | "cancelada";

export type OrdemPagamento = {
  id: string;
  representante_id: string;
  representante_codigo: string;
  representante_nome: string;
  supervisor_nome: string | null;
  competencia: string;
  data_ordem: string;
  status: StatusOrdem;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  itens: number;
  saldo_devedor_atual: number;
  autorizacoes_exigidas: number;
  autorizacoes_concedidas: number;
  autorizacoes_recusadas: number;
  liberada_para_pagamento: boolean;
  destinatario_nome: string | null;
  destinatario_motivo: string | null;
  favorecido_efetivo: string | null;
  banco_efetivo: string | null;
  agencia_efetiva: string | null;
  conta_efetiva: string | null;
  forma_pagamento: string | null;
  data_pagamento: string | null;
  valor_pago: number | null;
  comprovante: string | null;
};

/** Uma linha da ordem, no formato do formulário: rubrica, data, valor, observação. */
export type LinhaOrdem = {
  item_id: string;
  rubrica: string;
  rotulo: string;
  ordem_exibicao: number;
  automatica: boolean;
  gera_debito: boolean;
  contrato_id: string | null;
  codigo_contrato: string | null;
  descricao: string;
  data_referencia: string | null;
  valor_bruto: number;
  desconto: number;
  valor_liquido: number;
  observacao: string | null;
};

export type Rubrica = {
  codigo: string;
  rotulo: string;
  ordem: number;
  sinal: number;
  automatica: boolean;
  gera_debito: boolean;
  exige_contrato: boolean;
};

export type InstanciaAutorizacao = "operacao" | "supervisao" | "admin";

export type Autorizacao = {
  id: string;
  instancia: InstanciaAutorizacao;
  decisao: "pendente" | "autorizada" | "recusada";
  decidido_em: string | null;
  decidido_por: string | null;
  registrado_por: string | null;
  observacao: string | null;
};

/** Linha do relatório do representante, com a origem do valor identificada. */
export type LinhaRelatorio = {
  item_id: string;
  rubrica: string;
  rotulo: string;
  ordem_exibicao: number;
  codigo_contrato: string | null;
  nome_fantasia: string | null;
  data_venda: string | null;
  origem_representante_id: string;
  origem_codigo: string;
  origem_nome: string;
  e_da_equipe: boolean;
  data_referencia: string | null;
  valor_liquido: number;
  descricao: string;
  observacao: string | null;
};

export type DebitoRepresentante = {
  id: string;
  representante_codigo: string;
  representante_nome: string;
  motivo: string;
  data_origem: string;
  valor_original: number;
  valor_abatido: number;
  saldo: number;
};

export type ContratoResumo = {
  id: string;
  codigo_contrato: string;
  nome_fantasia: string | null;
  data_venda: string;
};

const chave = {
  ordens: (competencia: string) => ["pagamentos", "ordens", competencia] as const,
  linhas: (ordemId: string) => ["pagamentos", "linhas", ordemId] as const,
  autorizacoes: (ordemId: string) => ["pagamentos", "autorizacoes", ordemId] as const,
  rubricas: ["pagamentos", "rubricas"] as const,
  debitos: ["pagamentos", "debitos"] as const,
  contratos: (representanteId: string) => ["pagamentos", "contratos", representanteId] as const,
  relatorio: (ordemId: string) => ["pagamentos", "relatorio", ordemId] as const,
};

export function useOrdensPagamento(competencia: string) {
  return useQuery({
    queryKey: chave.ordens(competencia),
    queryFn: async (): Promise<OrdemPagamento[]> => {
      const { data, error } = await cliente()
        .from("v_ordens_pagamento")
        .select("*")
        .eq("competencia", `${competencia}-01`)
        .order("representante_nome");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        representante_id: String(linha["representante_id"]),
        representante_codigo: String(linha["representante_codigo"]),
        representante_nome: String(linha["representante_nome"]),
        supervisor_nome: texto(linha["supervisor_nome"]),
        competencia: String(linha["competencia"]),
        data_ordem: String(linha["data_ordem"]),
        status: linha["status"] as StatusOrdem,
        total_bruto: numero(linha["total_bruto"]),
        total_desconto: numero(linha["total_desconto"]),
        total_liquido: numero(linha["total_liquido"]),
        itens: numero(linha["itens"]),
        saldo_devedor_atual: numero(linha["saldo_devedor_atual"]),
        autorizacoes_exigidas: numero(linha["autorizacoes_exigidas"]),
        autorizacoes_concedidas: numero(linha["autorizacoes_concedidas"]),
        autorizacoes_recusadas: numero(linha["autorizacoes_recusadas"]),
        liberada_para_pagamento: Boolean(linha["liberada_para_pagamento"]),
        destinatario_nome: texto(linha["destinatario_nome"]),
        destinatario_motivo: texto(linha["destinatario_motivo"]),
        favorecido_efetivo: texto(linha["favorecido_efetivo"]),
        banco_efetivo: texto(linha["banco_efetivo"]),
        agencia_efetiva: texto(linha["agencia_efetiva"]),
        conta_efetiva: texto(linha["conta_efetiva"]),
        forma_pagamento: texto(linha["forma_pagamento"]),
        data_pagamento: texto(linha["data_pagamento"]),
        valor_pago: linha["valor_pago"] === null ? null : numero(linha["valor_pago"]),
        comprovante: texto(linha["comprovante"]),
      }));
    },
  });
}

export function useLinhasOrdem(ordemId?: string) {
  return useQuery({
    queryKey: chave.linhas(ordemId ?? ""),
    enabled: Boolean(ordemId),
    queryFn: async (): Promise<LinhaOrdem[]> => {
      const { data, error } = await cliente()
        .from("v_ordem_pagamento_linhas")
        .select("*")
        .eq("ordem_id", ordemId!)
        .order("ordem_exibicao")
        .order("data_referencia");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        item_id: String(linha["item_id"]),
        rubrica: String(linha["rubrica"]),
        rotulo: String(linha["rotulo"]),
        ordem_exibicao: numero(linha["ordem_exibicao"]),
        automatica: Boolean(linha["automatica"]),
        gera_debito: Boolean(linha["gera_debito"]),
        contrato_id: texto(linha["contrato_id"]),
        codigo_contrato: texto(linha["codigo_contrato"]),
        descricao: String(linha["descricao"]),
        data_referencia: texto(linha["data_referencia"]),
        valor_bruto: numero(linha["valor_bruto"]),
        desconto: numero(linha["desconto"]),
        valor_liquido: numero(linha["valor_liquido"]),
        observacao: texto(linha["observacao"]),
      }));
    },
  });
}

export function useRubricas() {
  return useQuery({
    queryKey: chave.rubricas,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Rubrica[]> => {
      const { data, error } = await cliente()
        .from("rubricas_pagamento")
        .select("codigo, rotulo, ordem, sinal, automatica, gera_debito, exige_contrato")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        codigo: String(linha["codigo"]),
        rotulo: String(linha["rotulo"]),
        ordem: numero(linha["ordem"]),
        sinal: numero(linha["sinal"]),
        automatica: Boolean(linha["automatica"]),
        gera_debito: Boolean(linha["gera_debito"]),
        exige_contrato: Boolean(linha["exige_contrato"]),
      }));
    },
  });
}

export function useAutorizacoes(ordemId?: string) {
  return useQuery({
    queryKey: chave.autorizacoes(ordemId ?? ""),
    enabled: Boolean(ordemId),
    queryFn: async (): Promise<Autorizacao[]> => {
      const { data, error } = await cliente()
        .from("ordem_pagamento_autorizacoes")
        .select(
          "id, instancia, decisao, decidido_em, decidido_por, registrado_por, observacao",
        )
        .eq("ordem_id", ordemId!)
        .order("instancia");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        instancia: linha["instancia"] as InstanciaAutorizacao,
        decisao: linha["decisao"] as Autorizacao["decisao"],
        decidido_em: texto(linha["decidido_em"]),
        decidido_por: texto(linha["decidido_por"]),
        registrado_por: texto(linha["registrado_por"]),
        observacao: texto(linha["observacao"]),
      }));
    },
  });
}

export function useRelatorioPagamento(ordemId?: string) {
  return useQuery({
    queryKey: chave.relatorio(ordemId ?? ""),
    enabled: Boolean(ordemId),
    queryFn: async (): Promise<LinhaRelatorio[]> => {
      const { data, error } = await cliente()
        .from("v_relatorio_pagamento")
        .select("*")
        .eq("ordem_id", ordemId!)
        .order("ordem_exibicao")
        .order("data_referencia");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        item_id: String(linha["item_id"]),
        rubrica: String(linha["rubrica"]),
        rotulo: String(linha["rotulo"]),
        ordem_exibicao: numero(linha["ordem_exibicao"]),
        codigo_contrato: texto(linha["codigo_contrato"]),
        nome_fantasia: texto(linha["nome_fantasia"]),
        data_venda: texto(linha["data_venda"]),
        origem_representante_id: String(linha["origem_representante_id"]),
        origem_codigo: String(linha["origem_codigo"]),
        origem_nome: String(linha["origem_nome"]),
        e_da_equipe: Boolean(linha["e_da_equipe"]),
        data_referencia: texto(linha["data_referencia"]),
        valor_liquido: numero(linha["valor_liquido"]),
        descricao: String(linha["descricao"]),
        observacao: texto(linha["observacao"]),
      }));
    },
  });
}

export function useDebitos() {
  return useQuery({
    queryKey: chave.debitos,
    queryFn: async (): Promise<DebitoRepresentante[]> => {
      const { data, error } = await cliente()
        .from("v_representante_debitos")
        .select("*")
        .gt("saldo", 0)
        .order("representante_nome");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        representante_codigo: String(linha["representante_codigo"]),
        representante_nome: String(linha["representante_nome"]),
        motivo: String(linha["motivo"]),
        data_origem: String(linha["data_origem"]),
        valor_original: numero(linha["valor_original"]),
        valor_abatido: numero(linha["valor_abatido"]),
        saldo: numero(linha["saldo"]),
      }));
    },
  });
}

/** Contratos do representante, para as rubricas que exigem apontar o contrato. */
export function useContratosDoRepresentante(representanteId?: string) {
  return useQuery({
    queryKey: chave.contratos(representanteId ?? ""),
    enabled: Boolean(representanteId),
    queryFn: async (): Promise<ContratoResumo[]> => {
      const { data, error } = await cliente()
        .from("representante_contratos")
        .select("id, codigo_contrato, nome_fantasia, data_venda")
        .eq("representante_id", representanteId!)
        .is("cancelado_em", null)
        .order("data_venda", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        codigo_contrato: String(linha["codigo_contrato"]),
        nome_fantasia: texto(linha["nome_fantasia"]),
        data_venda: String(linha["data_venda"]),
      }));
    },
  });
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
}

/** Uma linha do que ainda pode ser pago a este representante. */
export type PagamentoDisponivel = {
  rubrica: string;
  rotulo: string;
  contrato_id: string | null;
  codigo_contrato: string | null;
  descricao: string;
  data_referencia: string | null;
  valor: number;
};

export type RepresentanteOpcao = { id: string; codigo: string; nome: string };

export function useRepresentantes() {
  return useQuery({
    queryKey: ["pagamentos", "representantes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RepresentanteOpcao[]> => {
      const { data, error } = await cliente()
        .from("representantes")
        .select("id, codigo, nome")
        .order("nome");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l["id"]),
        codigo: String(l["codigo"]),
        nome: String(l["nome"]),
      }));
    },
  });
}

export type AutorizacaoPendente = {
  ordem_id: string;
  data_ordem: string;
  representante_codigo: string;
  representante_nome: string;
  total_itens: number;
  total_valor: number;
};

export function useAutorizacoesPendentes() {
  return useQuery({
    queryKey: ["pagamentos", "autorizacoes-pendentes"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AutorizacaoPendente[]> => {
      const { data, error } = await cliente()
        .from("v_autorizacoes_pendentes_supervisao")
        .select("*");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        ordem_id: String(l["ordem_id"]),
        data_ordem: String(l["data_ordem"]),
        representante_codigo: String(l["representante_codigo"]),
        representante_nome: String(l["representante_nome"]),
        total_itens: numero(l["total_itens"]),
        total_valor: numero(l["total_valor"]),
      }));
    },
  });
}

export type OrdemProntaPagar = {
  id: string;
  data_ordem: string;
  representante_codigo: string;
  representante_nome: string;
  total_itens: number;
  total_valor: number;
  situacao: string;
  pode_pagar: boolean;
};

export function useOrdensProntasParaPagar() {
  return useQuery({
    queryKey: ["pagamentos", "prontas-pagar"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<OrdemProntaPagar[]> => {
      const { data, error } = await cliente()
        .from("v_ordens_prontas_para_pagar")
        .select("*");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l["id"]),
        data_ordem: String(l["data_ordem"]),
        representante_codigo: String(l["representante_codigo"]),
        representante_nome: String(l["representante_nome"]),
        total_itens: numero(l["total_itens"]),
        total_valor: numero(l["total_valor"]),
        situacao: String(l["situacao"]),
        pode_pagar: Boolean(l["pode_pagar"]),
      }));
    },
  });
}

export type OrdemAberta = {
  id: string;
  data_ordem: string;
  representante_codigo: string;
  representante_nome: string;
  total_itens: number;
  total_valor: number;
  autorizacoes_exigidas: number;
  autorizacoes_pendentes: number;
};

export function useOrdensAbertasOperacao() {
  return useQuery({
    queryKey: ["pagamentos", "abertas-operacao"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<OrdemAberta[]> => {
      const { data, error } = await cliente()
        .from("v_ordens_abertas_operacao")
        .select("*");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l["id"]),
        data_ordem: String(l["data_ordem"]),
        representante_codigo: String(l["representante_codigo"]),
        representante_nome: String(l["representante_nome"]),
        total_itens: numero(l["total_itens"]),
        total_valor: numero(l["total_valor"]),
        autorizacoes_exigidas: numero(l["autorizacoes_exigidas"]),
        autorizacoes_pendentes: numero(l["autorizacoes_pendentes"]),
      }));
    },
  });
}

export function usePagamentosDisponiveis(representanteId?: string, data?: string) {
  return useQuery({
    queryKey: ["pagamentos", "disponiveis", representanteId ?? "", data ?? ""],
    enabled: Boolean(representanteId),
    queryFn: async (): Promise<PagamentoDisponivel[]> => {
      const { data: linhas, error } = await cliente().rpc("pagamentos_disponiveis", {
        p_representante_id: representanteId!,
        p_data: data ?? new Date().toISOString().slice(0, 10),
      });
      if (error) throw new Error(error.message);
      return ((linhas ?? []) as Record<string, unknown>[]).map((l) => ({
        rubrica: String(l["rubrica"]),
        rotulo: String(l["rotulo"]),
        contrato_id: texto(l["contrato_id"]),
        codigo_contrato: texto(l["codigo_contrato"]),
        descricao: String(l["descricao"]),
        data_referencia: texto(l["data_referencia"]),
        valor: numero(l["valor"]),
      }));
    },
  });
}

export function useCriarOrdem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { representanteId: string; data: string }): Promise<string> => {
      const { data, error } = await cliente().rpc("criar_ordem_pagamento", {
        p_representante_id: entrada.representanteId,
        p_data: entrada.data,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useIncluirContratos() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      rubrica: string;
      contratoIds: string[];
    }): Promise<number> => {
      const { data, error } = await cliente().rpc("incluir_contratos_na_ordem", {
        p_ordem_id: entrada.ordemId,
        p_rubrica: entrada.rubrica,
        p_contrato_ids: entrada.contratoIds,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useIncluirRubricaMensal() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { ordemId: string; rubrica: string }): Promise<number> => {
      const { data, error } = await cliente().rpc("incluir_rubrica_mensal_na_ordem", {
        p_ordem_id: entrada.ordemId,
        p_rubrica: entrada.rubrica,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => void invalidar(),
  });
}

/** Fechar e cancelar continuam sendo da operação; pagar é só da gerência. */
export function useAcaoOrdem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      acao: "fechar" | "cancelar" | "reabrir";
      motivo?: string | undefined;
    }) => {
      const rpc =
        entrada.acao === "fechar"
          ? "fechar_ordem_pagamento"
          : entrada.acao === "cancelar"
            ? "cancelar_ordem_pagamento"
            : "reabrir_ordem_pagamento";
      const args =
        entrada.acao === "fechar"
          ? { p_ordem_id: entrada.ordemId }
          : { p_ordem_id: entrada.ordemId, p_motivo: entrada.motivo ?? "" };
      const { error } = await cliente().rpc(rpc, args);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function usePagarOrdem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      forma: string;
      data: string;
      valor: number;
      comprovante?: string | undefined;
    }) => {
      const { error } = await cliente().rpc("pagar_ordem_pagamento", {
        p_ordem_id: entrada.ordemId,
        p_forma: entrada.forma,
        p_data: entrada.data,
        p_valor: entrada.valor,
        p_comprovante: entrada.comprovante ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useAdicionarItem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      rubrica: string;
      valor: number;
      data?: string | undefined;
      observacao?: string | undefined;
      contratoId?: string | undefined;
    }) => {
      const { error } = await cliente().rpc("adicionar_item_ordem", {
        p_ordem_id: entrada.ordemId,
        p_rubrica: entrada.rubrica,
        p_valor: entrada.valor,
        p_data: entrada.data ?? null,
        p_observacao: entrada.observacao ?? null,
        p_contrato_id: entrada.contratoId ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverItem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await cliente().rpc("remover_item_ordem", { p_item_id: itemId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useExigirAutorizacao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      instancia: InstanciaAutorizacao;
    }) => {
      const { error } = await cliente().rpc("exigir_autorizacao_ordem", {
        p_ordem_id: entrada.ordemId,
        p_instancia: entrada.instancia,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverExigencia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { ordemId: string; instancia: InstanciaAutorizacao }) => {
      const { error } = await cliente().rpc("remover_exigencia_autorizacao", {
        p_ordem_id: entrada.ordemId,
        p_instancia: entrada.instancia,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useDecidirAutorizacao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      instancia: InstanciaAutorizacao;
      decisao: "autorizada" | "recusada";
      observacao?: string | undefined;
    }) => {
      const { error } = await cliente().rpc("decidir_autorizacao_ordem", {
        p_ordem_id: entrada.ordemId,
        p_instancia: entrada.instancia,
        p_decisao: entrada.decisao,
        p_observacao: entrada.observacao ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useDefinirDestinatario() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      nome: string;
      motivo: string;
      documento?: string | undefined;
      banco?: string | undefined;
      agencia?: string | undefined;
      conta?: string | undefined;
      tipoConta?: string | undefined;
    }) => {
      const { error } = await cliente().rpc("definir_destinatario_ordem", {
        p_ordem_id: entrada.ordemId,
        p_nome: entrada.nome,
        p_motivo: entrada.motivo,
        p_documento: entrada.documento ?? null,
        p_banco: entrada.banco ?? null,
        p_agencia: entrada.agencia ?? null,
        p_conta: entrada.conta ?? null,
        p_tipo_conta: entrada.tipoConta ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useLimparDestinatario() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (ordemId: string) => {
      const { error } = await cliente().rpc("limpar_destinatario_ordem", { p_ordem_id: ordemId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useRegistrarDebito() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      representanteId: string;
      valor: number;
      motivo: string;
      data: string;
    }) => {
      const { error } = await cliente().rpc("registrar_debito_representante", {
        p_representante_id: entrada.representanteId,
        p_valor: entrada.valor,
        p_motivo: entrada.motivo,
        p_data: entrada.data,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useReabrirOrdem() {
  const acaoOrdem = useAcaoOrdem();
  return useMutation({
    mutationFn: async (entrada: { ordem_id: string; motivo: string }) => {
      return acaoOrdem.mutateAsync({
        ordemId: entrada.ordem_id,
        acao: "reabrir",
        motivo: entrada.motivo,
      });
    },
    onSuccess: acaoOrdem.onSuccess,
  });
}
