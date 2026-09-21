import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

export type OpcaoCadastro = {
  categoria: "status_pos_venda" | "tipo_pendencia" | "motivo_nao_premiavel";
  codigo: string;
  rotulo: string;
};

export type RepresentanteOpcao = {
  id: string;
  codigo: string;
  nome: string;
  valor_premiacao_contrato: number | null;
  lider_id: string | null;
  lider_nome: string | null;
  valor_comissao_lideranca: number | null;
};

/** Contrato já lançado, com os valores líquidos calculados no banco. */
export type ContratoLancado = {
  id: string;
  data_venda: string;
  codigo_contrato: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  valor_plano: number | null;
  representante_codigo: string;
  representante_nome: string;
  premiavel: boolean;
  premiacao_liquida: number;
  lider_nome: string | null;
  comissao_lideranca_liquida: number;
  possui_pendencia: boolean;
  status_pos_venda: string | null;
  origem: string;
};

const chave = {
  opcoes: ["contratos", "opcoes"] as const,
  representantes: ["contratos", "representantes"] as const,
  lancados: (periodo: string) => ["contratos", "lancados", periodo] as const,
  incompletos: ["contratos", "incompletos"] as const,
};

export function useOpcoesCadastro() {
  return useQuery({
    queryKey: chave.opcoes,
    queryFn: async (): Promise<OpcaoCadastro[]> => {
      const { data, error } = await cliente()
        .from("opcoes_cadastro")
        .select("categoria, codigo, rotulo")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw new Error(error.message);
      return (data ?? []) as OpcaoCadastro[];
    },
  });
}

/** Todos os representantes, de qualquer supervisão — a operação lança na ordem em que as vendas fecham. */
export function useRepresentantesParaContrato() {
  return useQuery({
    queryKey: chave.representantes,
    queryFn: async (): Promise<RepresentanteOpcao[]> => {
      const { data, error } = await cliente()
        .from("v_representantes_configuracao")
        .select("id, codigo, nome, valor_premiacao_contrato, lider_id, lider_nome, valor_comissao_lideranca")
        .order("nome");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        codigo: String(linha["codigo"]),
        nome: String(linha["nome"]),
        valor_premiacao_contrato: numeroOuNulo(linha["valor_premiacao_contrato"]),
        lider_id: (linha["lider_id"] as string | null) ?? null,
        lider_nome: (linha["lider_nome"] as string | null) ?? null,
        valor_comissao_lideranca: numeroOuNulo(linha["valor_comissao_lideranca"]),
      }));
    },
  });
}

export function useContratosLancados(intervalo: { inicio: string; fim: string }, periodo: string) {
  return useQuery({
    queryKey: chave.lancados(periodo),
    queryFn: async (): Promise<ContratoLancado[]> => {
      const { data, error } = await cliente()
        .from("v_contratos_premiacao")
        .select("*")
        .gte("data_venda", intervalo.inicio)
        .lte("data_venda", intervalo.fim)
        .order("data_venda", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        data_venda: String(linha["data_venda"]),
        codigo_contrato: String(linha["codigo_contrato"]),
        nome_fantasia: (linha["nome_fantasia"] as string | null) ?? null,
        cnpj: (linha["cnpj"] as string | null) ?? null,
        valor_plano: numeroOuNulo(linha["valor_plano"]),
        representante_codigo: String(linha["representante_codigo"]),
        representante_nome: String(linha["representante_nome"]),
        premiavel: Boolean(linha["premiavel"]),
        premiacao_liquida: numeroOuNulo(linha["premiacao_liquida"]) ?? 0,
        lider_nome: (linha["lider_nome"] as string | null) ?? null,
        comissao_lideranca_liquida: numeroOuNulo(linha["comissao_lideranca_liquida"]) ?? 0,
        possui_pendencia: Boolean(linha["possui_pendencia"]),
        status_pos_venda: (linha["status_pos_venda"] as string | null) ?? null,
        origem: String(linha["origem"]),
      }));
    },
  });
}

export function useContratosIncompletos() {
  return useQuery({
    queryKey: chave.incompletos,
    queryFn: async (): Promise<number> => {
      const { count, error } = await cliente()
        .from("v_contratos_incompletos")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useCadastrarContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: {
      representanteId: string;
      dataVenda: string;
      codigoContrato: string;
      nomeFantasia?: string;
      cnpj?: string;
      codigoCliente?: string;
      valorPlano: number | null;
      premiavel: boolean;
      motivoNaoPremiavel?: string;
      possuiPendencia: boolean;
      tipoPendencia?: string;
      statusPosVenda?: string;
      valorPremiacao: number | null;
      descontoPremiacao: number;
      motivoDescontoPremiacao?: string;
      descontoComissao: number;
      motivoDescontoComissao?: string;
      observacao?: string;
    }) => {
      const { error } = await cliente().rpc("cadastrar_contrato_representante", {
        p_representante_id: entrada.representanteId,
        p_data_venda: entrada.dataVenda,
        p_codigo_contrato: entrada.codigoContrato.trim(),
        p_nome_fantasia: entrada.nomeFantasia?.trim() || null,
        p_cnpj: entrada.cnpj?.trim() || null,
        p_codigo_cliente: entrada.codigoCliente?.trim() || null,
        p_valor_plano: entrada.valorPlano,
        p_premiavel: entrada.premiavel,
        p_motivo_nao_premiavel: entrada.motivoNaoPremiavel?.trim() || null,
        p_possui_pendencia: entrada.possuiPendencia,
        p_tipo_pendencia: entrada.tipoPendencia?.trim() || null,
        p_status_pos_venda: entrada.statusPosVenda?.trim() || null,
        p_valor_premiacao: entrada.valorPremiacao,
        p_desconto_premiacao: entrada.descontoPremiacao,
        p_motivo_desconto_premiacao: entrada.motivoDescontoPremiacao?.trim() || null,
        p_desconto_comissao: entrada.descontoComissao,
        p_motivo_desconto_comissao: entrada.motivoDescontoComissao?.trim() || null,
        p_observacao: entrada.observacao?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contratos"] }),
  });
}

/** Exclusão definitiva — apenas administrador (a função no banco barra os demais). */
export function useExcluirContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await cliente().rpc("excluir_contrato", {
        p_contrato_id: contratoId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contratos"] }),
  });
}

/** Apaga todos os contratos de um período — usado para refazer uma carga errada. */
export function useExcluirContratosPeriodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: {
      inicio: string;
      fim: string;
      somenteImportados: boolean;
    }): Promise<number> => {
      const { data, error } = await cliente().rpc("excluir_contratos_periodo", {
        p_inicio: entrada.inicio,
        p_fim: entrada.fim,
        p_somente_importados: entrada.somenteImportados,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contratos"] }),
  });
}
