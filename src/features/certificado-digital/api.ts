import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

export type Lead = {
  id: string;
  tipo: "cliente" | "parceiro_contador" | "representante";
  etapa: "novo_lead" | "contato_realizado" | "qualificado_interesse" | "negociacao_documentacao" | "convertido" | "perdido";
  razao_social_nome: string;
  contato_email: string | null;
  contato_telefone: string | null;
  responsavel_prospecao: string;
  data_criacao: string;
  data_ultimo_contato: string | null;
  dias_sem_contato: number;
  status: "ativo" | "perdido";
};

export type Indicador = {
  usuario_id: string;
  data_registro: string;
  tipo_indicador: string;
  frente: string | null;
  total: number;
};

export type MetaProspecao = {
  id: string;
  frente: "cliente" | "parceiro_contador" | "representante";
  meta_diaria: number;
};

export type VendaSerasa = {
  usuario_id: string;
  mes_referencia: string;
  total_vendido: number;
  meta: number;
};

export function useLeadsKanban(tipo?: string, etapa?: string) {
  let query = cliente().from("v_certificado_leads_kanban").select("*");
  if (tipo) query = query.eq("tipo", tipo);
  if (etapa) query = query.eq("etapa", etapa);

  return useQuery({
    queryKey: ["certificado", "leads", tipo, etapa],
    queryFn: async () => {
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
  });
}

export function useMudarEtapaLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { id: string; etapa: string; data_contato?: boolean }) => {
      const updates: any = { etapa: entrada.etapa, updated_at: new Date().toISOString() };
      if (entrada.data_contato) {
        updates.data_ultimo_contato = new Date().toISOString();
      }
      const { error } = await cliente().from("certificado_digital_leads").update(updates).eq("id", entrada.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "leads"] }),
  });
}

export function useIndicadoresDiarios(usuarioId: string, data: string) {
  return useQuery({
    queryKey: ["certificado", "indicadores", usuarioId, data],
    enabled: !!usuarioId,
    queryFn: async () => {
      const { data: indicadores, error } = await cliente()
        .from("v_certificado_indicadores_diarios")
        .select("*")
        .eq("usuario_id", usuarioId)
        .eq("data_registro", data);
      if (error) throw new Error(error.message);
      return (indicadores ?? []) as Indicador[];
    },
  });
}

export function useRegistrarIndicador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { usuario_id: string; tipo: string; frente?: string; quantidade?: number; data: string }) => {
      const { error } = await cliente().from("certificado_digital_indicadores").insert({
        usuario_id: entrada.usuario_id,
        data_registro: entrada.data,
        tipo_indicador: entrada.tipo,
        frente: entrada.frente,
        quantidade: entrada.quantidade ?? 1,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "indicadores"] }),
  });
}

export function useMetasProspecao() {
  return useQuery({
    queryKey: ["certificado", "metas"],
    queryFn: async () => {
      const { data, error } = await cliente().from("certificado_digital_metas").select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as MetaProspecao[];
    },
  });
}

export function useAtualizarMetaProspecao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { frente: string; meta_diaria: number }) => {
      const { error } = await cliente()
        .from("certificado_digital_metas")
        .upsert({ frente: entrada.frente, meta_diaria: entrada.meta_diaria }, { onConflict: "frente" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "metas"] }),
  });
}

export function useVendasSerasa() {
  return useQuery({
    queryKey: ["certificado", "serasa"],
    queryFn: async () => {
      const { data, error } = await cliente().from("v_serasa_vendas_mes").select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as VendaSerasa[];
    },
  });
}

export function useRegistrarVendaSerasa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { usuario_id: string; mes: string }) => {
      const { error } = await cliente().from("venda_cruzada_serasa").insert({
        usuario_id: entrada.usuario_id,
        data_registro: new Date().toISOString().split("T")[0],
        mes_referencia: entrada.mes + "-01",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificado", "serasa"] }),
  });
}

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
