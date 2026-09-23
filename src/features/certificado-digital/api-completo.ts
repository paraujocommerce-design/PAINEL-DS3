import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

export type Lead = {
  id: string;
  tipo: "cliente" | "parceiro_contador";
  etapa: string;
  razao_social_nome: string;
  cnpj_cpf: string;
  email_contato: string;
  telefone_contato: string;
  dias_sem_movimento: number;
  status: string;
  historico: string;
};

export type IndicadorDiario = {
  usuario_id: string;
  data_registro: string;
  tipo_indicador: string;
  frente: string | null;
  quantidade: number;
  quantidade_serasa: number;
};

export type PainelDepartamento = {
  usuario_id: string;
  nome_completo: string;
  apelido: string;
  tipo_operador: string;
  novo_lead_total: number;
  contato_realizado_total: number;
  qualificado_total: number;
  negociacao_total: number;
  convertido_total: number;
  perdido_total: number;
  indicadores_hoje: number;
};

export type MetaMensal = {
  meta_mensal_geral: number;
  meta_serasa_minimo: number;
  meta_serasa_maximo: number;
  convertidos_mes: number;
  serasa_mes: number;
};

export function useLeadsComHistorico(tipo?: string, status?: string) {
  return useQuery({
    queryKey: ["certificado", "leads", tipo, status],
    queryFn: async () => {
      let query = cliente().from("v_certificado_leads_com_historico").select("*");
      if (tipo) query = query.eq("tipo", tipo);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
  });
}

export function useMoverLeadParaEtapa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { id: string; etapa: string; data_verificacao?: boolean }) => {
      const updates: any = {
        etapa: entrada.etapa,
        updated_at: new Date().toISOString()
      };
      if (entrada.data_verificacao) {
        updates.data_ultima_verificacao = new Date().toISOString();
      }

      const { error } = await cliente()
        .from("certificado_digital_leads")
        .update(updates)
        .eq("id", entrada.id);
      if (error) throw new Error(error.message);

      // Registrar no histórico
      await cliente().from("certificado_digital_leads_historico").insert({
        lead_id: entrada.id,
        etapa_nova: entrada.etapa,
        movido_por: (await cliente().auth.getUser()).data.user?.id,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado"] }),
  });
}

export function useRegistrarIndicadorDiario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: IndicadorDiario) => {
      const { error } = await cliente()
        .from("certificado_digital_indicadores_diarios")
        .insert(entrada);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "indicadores"] }),
  });
}

export function usePainelDepartamento() {
  return useQuery({
    queryKey: ["certificado", "painel"],
    queryFn: async () => {
      const { data, error } = await cliente()
        .from("v_certificado_painel_departamento")
        .select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as PainelDepartamento[];
    },
  });
}

export function useMetaMensalAtual() {
  return useQuery({
    queryKey: ["certificado", "meta"],
    queryFn: async () => {
      const { data, error } = await cliente()
        .from("v_certificado_meta_mensal_atual")
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as MetaMensal;
    },
  });
}

export function useCriarLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: any) => {
      const { error } = await cliente()
        .from("certificado_digital_leads")
        .insert(entrada);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "leads"] }),
  });
}
