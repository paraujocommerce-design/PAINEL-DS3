import { useQuery, useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { cliente } from "@/lib/supabase";

export type ContratoAguardando = {
  id: string;
  data_venda: string;
  codigo_contrato: string;
  nome_fantasia: string;
  status_pos_venda: "ok" | "pendente" | null;
  pos_venda_pendente: boolean;
  premiavel: boolean;
  valor_plano: number | null;
  valor_disponivel_premiacao: number;
  valor_debito_pos_venda: number;
  tem_lideranca: boolean;
  valor_comissao_lideranca: number;
};

export type SaldoRepresentante = {
  id: string;
  codigo: string;
  nome: string;
  debito_pos_venda_pendente: number;
  credito_contratos_aguardando: number;
  saldo_devedor_existente: number;
  saldo_a_receber: number;
};

export function useContratosAguardando(representanteId?: string) {
  return useQuery({
    queryKey: ["pagamentos", "contratos-aguardando", representanteId ?? ""],
    enabled: Boolean(representanteId),
    queryFn: async (): Promise<ContratoAguardando[]> => {
      const { data, error } = await cliente()
        .from("v_contratos_aguardando_pagamento")
        .select("*")
        .eq("representante_id", representanteId!)
        .order("data_venda");
      if (error) throw new Error(error.message);
      return (data ?? []) as ContratoAguardando[];
    },
  });
}

export function useSaldoRepresentante(representanteId?: string) {
  return useQuery({
    queryKey: ["pagamentos", "saldo-representante", representanteId ?? ""],
    enabled: Boolean(representanteId),
    queryFn: async (): Promise<SaldoRepresentante | null> => {
      const { data, error } = await cliente()
        .from("v_saldo_representante_detalhado")
        .select("*")
        .eq("id", representanteId!)
        .single();
      if (error && error.code !== "PGRST116") throw new Error(error.message);
      return data as SaldoRepresentante | null;
    },
  });
}

export function useCriarOrdemCompleta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: {
      representanteId: string;
      dataOrdem: string;
      contratoIds: string[];
      rubricas: Record<string, number>; // codigo_rubrica -> valor
    }): Promise<string> => {
      // 1. Criar ordem vazia
      const { data: ordemId, error: erroOrdem } = await cliente().rpc(
        "criar_ordem_pagamento",
        {
          p_representante_id: entrada.representanteId,
          p_data: entrada.dataOrdem,
        }
      );
      if (erroOrdem) throw new Error(erroOrdem.message);

      // 2. Incluir contratos disponíveis
      if (entrada.contratoIds.length > 0) {
        const { error: erroContratos } = await cliente().rpc(
          "incluir_contratos_na_ordem",
          {
            p_ordem_id: ordemId,
            p_rubrica: "ajuda_custo_contrato",
            p_contrato_ids: entrada.contratoIds,
          }
        );
        if (erroContratos) throw new Error(erroContratos.message);
      }

      // 3. Incluir rubricas manuais (as que têm valor > 0)
      for (const [rubrica, valor] of Object.entries(entrada.rubricas)) {
        if (valor > 0) {
          const { error: erroRubrica } = await cliente().rpc(
            "adicionar_item_ordem",
            {
              p_ordem_id: ordemId,
              p_tipo: rubrica,
              p_valor_bruto: valor,
            }
          );
          if (erroRubrica) throw new Error(erroRubrica.message);
        }
      }

      return ordemId;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pagamentos'] }),
  });
}
