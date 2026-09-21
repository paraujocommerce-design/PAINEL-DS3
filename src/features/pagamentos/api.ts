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

export type OrdemPagamento = {
  id: string;
  representante_id: string;
  representante_codigo: string;
  representante_nome: string;
  competencia: string;
  status: "aberta" | "fechada" | "paga" | "cancelada";
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  itens: number;
  saldo_devedor_atual: number;
};

export type ItemOrdem = {
  id: string;
  tipo: "premiacao_contrato" | "comissao_lideranca" | "meta_plus" | "incentivo_comercial" | "ajuste";
  referencia: string | null;
  descricao: string;
  valor_bruto: number;
  desconto: number;
  valor_liquido: number;
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

const chave = {
  ordens: (competencia: string) => ["pagamentos", "ordens", competencia] as const,
  itens: (ordemId: string) => ["pagamentos", "itens", ordemId] as const,
  debitos: ["pagamentos", "debitos"] as const,
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
        competencia: String(linha["competencia"]),
        status: linha["status"] as OrdemPagamento["status"],
        total_bruto: numero(linha["total_bruto"]),
        total_desconto: numero(linha["total_desconto"]),
        total_liquido: numero(linha["total_liquido"]),
        itens: numero(linha["itens"]),
        saldo_devedor_atual: numero(linha["saldo_devedor_atual"]),
      }));
    },
  });
}

export function useItensOrdem(ordemId?: string) {
  return useQuery({
    queryKey: chave.itens(ordemId ?? ""),
    enabled: Boolean(ordemId),
    queryFn: async (): Promise<ItemOrdem[]> => {
      const { data, error } = await cliente()
        .from("ordem_pagamento_itens")
        .select("id, tipo, referencia, descricao, valor_bruto, desconto, valor_liquido")
        .eq("ordem_id", ordemId!)
        .order("tipo")
        .order("descricao");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        tipo: linha["tipo"] as ItemOrdem["tipo"],
        referencia: (linha["referencia"] as string | null) ?? null,
        descricao: String(linha["descricao"]),
        valor_bruto: numero(linha["valor_bruto"]),
        desconto: numero(linha["desconto"]),
        valor_liquido: numero(linha["valor_liquido"]),
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

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
}

/** Apura (ou reapura) todas as ordens da competência. */
export function useApurarCompetencia() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (competencia: string): Promise<number> => {
      const { data, error } = await cliente().rpc("apurar_competencia", {
        p_competencia: `${competencia}-01`,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useAcaoOrdem() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      ordemId: string;
      acao: "fechar" | "pagar" | "cancelar";
      motivo?: string;
    }) => {
      const rpc =
        entrada.acao === "fechar"
          ? "fechar_ordem_pagamento"
          : entrada.acao === "pagar"
            ? "pagar_ordem_pagamento"
            : "cancelar_ordem_pagamento";
      const args =
        entrada.acao === "cancelar"
          ? { p_ordem_id: entrada.ordemId, p_motivo: entrada.motivo ?? "" }
          : { p_ordem_id: entrada.ordemId };
      const { error } = await cliente().rpc(rpc, args);
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
