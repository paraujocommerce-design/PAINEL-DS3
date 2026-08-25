import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Oportunidade (view v_prefeitura_oportunidades). */
export type Oportunidade = {
  id: string;
  prefeitura_id: string;
  prefeitura_nome: string;
  uf: string;
  etapa_atual: string;
  status: "aberta" | "ganha" | "perdida";
  responsavel_supervisor_id: string;
  responsavel_nome: string;
  data_entrada: string;
  ultima_movimentacao: string;
  etapa_desde: string;
  proximo_passo: string | null;
  prazo: string | null;
  tipo_espera: "interna" | "externa" | null;
  dependencia_externa: string | null;
  observacao: string | null;
  motivo_perda: string | null;
  encerrada_em: string | null;
  decisores_identificados: number;
};

export type Contrato = {
  id: string;
  prefeitura_id: string;
  prefeitura_nome: string;
  uf: string;
  oportunidade_id: string | null;
  tipo: "nova" | "renovacao";
  data_contrato: string;
  contrato_anterior_id: string | null;
  origem: string;
  observacao: string | null;
};

export type Movimento = {
  id: string;
  oportunidade_id: string;
  prefeitura_id: string;
  prefeitura_nome: string;
  tipo: string;
  etapa_anterior: string | null;
  etapa_nova: string;
  ocorrido_em: string;
  motivo: string | null;
  proximo_passo: string | null;
  prazo: string | null;
  tipo_espera: string | null;
  dependencia_externa: string | null;
  created_at: string;
};

export type Interacao = {
  id: string;
  oportunidade_id: string;
  tipo: string;
  ocorrido_em: string;
  descricao: string;
};

export type Contato = {
  id: string;
  prefeitura_id: string;
  nome: string;
  funcao: string | null;
  decisor: boolean;
  contato: string | null;
  observacao: string | null;
  ativo: boolean;
};

export type Prefeitura = { id: string; nome: string; uf: string; observacao: string | null };

export type MetaPrefeitura = {
  id: string;
  indicador: "novas_prefeituras_mes" | "renovacoes_prefeituras_mes";
  valor: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
};

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

async function usuarioAtual(): Promise<string> {
  const { data, error } = await cliente().auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sessão expirada. Entre novamente.");
  return data.user.id;
}

const chave = {
  responsavel: ["prefeituras", "responsavel"] as const,
  prefeituras: ["prefeituras", "lista"] as const,
  oportunidades: ["prefeituras", "oportunidades"] as const,
  contratos: (periodo: string) => ["prefeituras", "contratos", periodo] as const,
  movimentos: (periodo: string) => ["prefeituras", "movimentos", periodo] as const,
  metas: (periodo: string) => ["prefeituras", "metas", periodo] as const,
  detalhe: (id: string) => ["prefeituras", "detalhe", id] as const,
  contatos: (id: string) => ["prefeituras", "contatos", id] as const,
};

/** Responsável operacional da frente (contexto de supervisão já existente). */
export function useResponsavelPrefeituras(slug = "clenio") {
  return useQuery({
    queryKey: chave.responsavel,
    queryFn: async (): Promise<{ id: string; slug: string; nome: string }> => {
      const { data, error } = await cliente()
        .from("supervisores")
        .select("id, slug, nome")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Responsável da frente não encontrado no banco de dados.");
      return data as { id: string; slug: string; nome: string };
    },
  });
}

export function usePrefeituras() {
  return useQuery({
    queryKey: chave.prefeituras,
    queryFn: async (): Promise<Prefeitura[]> => {
      const { data, error } = await cliente()
        .from("prefeituras")
        .select("id, nome, uf, observacao")
        .order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as Prefeitura[];
    },
  });
}

export function useOportunidades() {
  return useQuery({
    queryKey: chave.oportunidades,
    queryFn: async (): Promise<Oportunidade[]> => {
      const { data, error } = await cliente()
        .from("v_prefeitura_oportunidades")
        .select("*")
        .order("prazo", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Oportunidade[];
    },
  });
}

export function useContratosPeriodo(periodo: string, intervalo: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: chave.contratos(periodo),
    queryFn: async (): Promise<Contrato[]> => {
      const { data, error } = await cliente()
        .from("v_prefeitura_contratos_validos")
        .select("*")
        .gte("data_contrato", intervalo.inicio)
        .lte("data_contrato", intervalo.fim)
        .order("data_contrato", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Contrato[];
    },
  });
}

export function useMovimentosPeriodo(periodo: string, intervalo: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: chave.movimentos(periodo),
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await cliente()
        .from("v_prefeitura_movimentos")
        .select("*")
        .gte("ocorrido_em", intervalo.inicio)
        .lte("ocorrido_em", intervalo.fim)
        .order("ocorrido_em", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Movimento[];
    },
  });
}

/** Metas da frente vigentes no período (histórico nunca é sobrescrito). */
export function useMetasPrefeituras(periodo: string, intervalo: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: chave.metas(periodo),
    queryFn: async (): Promise<MetaPrefeitura[]> => {
      const { data, error } = await cliente()
        .from("prefeitura_metas")
        .select("id, indicador, valor, vigencia_inicio, vigencia_fim")
        .lte("vigencia_inicio", intervalo.fim)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as MetaPrefeitura[]).filter(
        (meta) => meta.vigencia_fim === null || meta.vigencia_fim >= intervalo.inicio,
      );
    },
  });
}

export type DetalheOportunidade = {
  movimentos: Movimento[];
  interacoes: Interacao[];
  contatos: Contato[];
  contratos: Contrato[];
};

export function useDetalheOportunidade(oportunidade: Oportunidade | null) {
  return useQuery({
    queryKey: chave.detalhe(oportunidade?.id ?? "—"),
    enabled: Boolean(oportunidade),
    queryFn: async (): Promise<DetalheOportunidade> => {
      const db = cliente();
      const [movimentos, interacoes, contatos, contratos] = await Promise.all([
        db
          .from("v_prefeitura_movimentos")
          .select("*")
          .eq("oportunidade_id", oportunidade!.id)
          .order("ocorrido_em", { ascending: false })
          .order("created_at", { ascending: false }),
        db
          .from("prefeitura_interacoes")
          .select("id, oportunidade_id, tipo, ocorrido_em, descricao")
          .eq("oportunidade_id", oportunidade!.id)
          .order("ocorrido_em", { ascending: false }),
        db
          .from("prefeitura_contatos")
          .select("id, prefeitura_id, nome, funcao, decisor, contato, observacao, ativo")
          .eq("prefeitura_id", oportunidade!.prefeitura_id)
          .order("decisor", { ascending: false })
          .order("nome"),
        db
          .from("v_prefeitura_contratos_validos")
          .select("*")
          .eq("prefeitura_id", oportunidade!.prefeitura_id)
          .order("data_contrato", { ascending: false }),
      ]);

      const erro = movimentos.error ?? interacoes.error ?? contatos.error ?? contratos.error;
      if (erro) throw new Error(erro.message);

      return {
        movimentos: (movimentos.data ?? []) as Movimento[],
        interacoes: (interacoes.data ?? []) as Interacao[],
        contatos: (contatos.data ?? []) as Contato[],
        contratos: (contratos.data ?? []) as Contrato[],
      };
    },
  });
}

/** Contratos válidos (não cancelados) de uma prefeitura — base da renovação. */
export function useContratosValidosPrefeitura(prefeituraId: string | null) {
  return useQuery({
    queryKey: ["prefeituras", "contratos-prefeitura", prefeituraId ?? "—"],
    enabled: Boolean(prefeituraId),
    queryFn: async (): Promise<Contrato[]> => {
      const { data, error } = await cliente()
        .from("v_prefeitura_contratos_validos")
        .select("*")
        .eq("prefeitura_id", prefeituraId!)
        .order("data_contrato", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Contrato[];
    },
  });
}

export function useContatosPrefeitura(prefeituraId: string | null) {
  return useQuery({
    queryKey: chave.contatos(prefeituraId ?? "—"),
    enabled: Boolean(prefeituraId),
    queryFn: async (): Promise<Contato[]> => {
      const { data, error } = await cliente()
        .from("prefeitura_contatos")
        .select("id, prefeitura_id, nome, funcao, decisor, contato, observacao, ativo")
        .eq("prefeitura_id", prefeituraId!)
        .order("decisor", { ascending: false })
        .order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as Contato[];
    },
  });
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["prefeituras"] });
}

function mensagem(codigo: string | undefined, texto: string): string {
  if (codigo === "23505") return "Registro duplicado: já existe cadastro equivalente.";
  return texto;
}

async function chamar(nome: string, parametros: Record<string, unknown>) {
  const { data, error } = await cliente().rpc(nome, parametros);
  if (error) throw new Error(mensagem(error.code, error.message));
  return data as unknown;
}

export function useCriarPrefeitura() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { nome: string; uf: string; observacao?: string }) =>
      chamar("criar_prefeitura", {
        p_nome: entrada.nome.trim(),
        p_uf: entrada.uf.trim().toUpperCase(),
        p_observacao: entrada.observacao?.trim() || null,
      }),
    onSuccess: () => void invalidar(),
  });
}

/** Abertura: o responsável (Clênio) é resolvido no banco, não pela aplicação. */
export function useAbrirOportunidade() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      prefeituraId: string;
      proximoPasso: string;
      prazo: string;
      tipoEspera: "interna" | "externa" | null;
      dependenciaExterna?: string;
      dataEntrada: string;
      observacao?: string;
    }) =>
      chamar("abrir_oportunidade_prefeitura", {
        p_prefeitura_id: entrada.prefeituraId,
        p_proximo_passo: entrada.proximoPasso.trim(),
        p_prazo: entrada.prazo,
        p_tipo_espera: entrada.tipoEspera,
        p_dependencia_externa:
          entrada.tipoEspera === "externa" ? entrada.dependenciaExterna?.trim() || null : null,
        p_data_entrada: entrada.dataEntrada,
        p_observacao: entrada.observacao?.trim() || null,
      }),
    onSuccess: () => void invalidar(),
  });
}

export function useMoverEtapa() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      oportunidadeId: string;
      etapaNova: string;
      proximoPasso: string;
      prazo: string;
      tipoEspera: "interna" | "externa" | null;
      dependenciaExterna?: string;
      motivo?: string;
      ocorridoEm: string;
    }) =>
      chamar("mover_etapa_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_etapa_nova: entrada.etapaNova,
        p_proximo_passo: entrada.proximoPasso.trim(),
        p_prazo: entrada.prazo,
        p_tipo_espera: entrada.tipoEspera,
        p_dependencia_externa:
          entrada.tipoEspera === "externa" ? entrada.dependenciaExterna?.trim() || null : null,
        p_motivo: entrada.motivo?.trim() || null,
        p_ocorrido_em: entrada.ocorridoEm,
      }),
    onSuccess: () => void invalidar(),
  });
}

/** Atualização do próximo passo: append-only, o valor anterior fica no histórico. */
export function useDefinirProximoPasso() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      oportunidadeId: string;
      proximoPasso: string;
      prazo: string;
      tipoEspera: "interna" | "externa" | null;
      dependenciaExterna?: string;
      ocorridoEm: string;
      observacao?: string;
    }) =>
      chamar("definir_proximo_passo_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_proximo_passo: entrada.proximoPasso.trim(),
        p_prazo: entrada.prazo,
        p_tipo_espera: entrada.tipoEspera,
        p_dependencia_externa:
          entrada.tipoEspera === "externa" ? entrada.dependenciaExterna?.trim() || null : null,
        p_ocorrido_em: entrada.ocorridoEm,
        p_observacao: entrada.observacao?.trim() || null,
      }),
    onSuccess: () => void invalidar(),
  });
}

export function useGanharOportunidade() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      oportunidadeId: string;
      dataContrato: string;
      observacao?: string;
    }) =>
      chamar("ganhar_oportunidade_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_data_contrato: entrada.dataContrato,
        p_observacao: entrada.observacao?.trim() || null,
      }),
    onSuccess: () => void invalidar(),
  });
}

export function usePerderOportunidade() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { oportunidadeId: string; motivo: string; ocorridoEm: string }) =>
      chamar("perder_oportunidade_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_motivo: entrada.motivo.trim(),
        p_ocorrido_em: entrada.ocorridoEm,
      }),
    onSuccess: () => void invalidar(),
  });
}

export function useReabrirOportunidade() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      oportunidadeId: string;
      motivo: string;
      proximoPasso: string;
      prazo: string;
      tipoEspera: "interna" | "externa" | null;
      dependenciaExterna?: string;
      ocorridoEm: string;
    }) =>
      chamar("reabrir_oportunidade_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_motivo: entrada.motivo.trim(),
        p_proximo_passo: entrada.proximoPasso.trim(),
        p_prazo: entrada.prazo,
        p_tipo_espera: entrada.tipoEspera,
        p_dependencia_externa:
          entrada.tipoEspera === "externa" ? entrada.dependenciaExterna?.trim() || null : null,
        p_ocorrido_em: entrada.ocorridoEm,
      }),
    onSuccess: () => void invalidar(),
  });
}

/** Renovação exige o contrato anterior válido da mesma prefeitura. */
export function useRegistrarRenovacao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      prefeituraId: string;
      dataContrato: string;
      contratoAnteriorId: string;
      observacao?: string;
    }) =>
      chamar("registrar_renovacao_prefeitura", {
        p_prefeitura_id: entrada.prefeituraId,
        p_data_contrato: entrada.dataContrato,
        p_contrato_anterior_id: entrada.contratoAnteriorId,
        p_observacao: entrada.observacao?.trim() || null,
      }),

    onSuccess: () => void invalidar(),
  });
}

export function useCancelarContrato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { contratoId: string; motivo: string }) =>
      chamar("cancelar_contrato_prefeitura", {
        p_contrato_id: entrada.contratoId,
        p_motivo: entrada.motivo.trim(),
      }),
    onSuccess: () => void invalidar(),
  });
}

export function useRegistrarContato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      prefeituraId: string;
      nome: string;
      funcao?: string;
      decisor: boolean;
      contato?: string;
      observacao?: string;
    }) =>
      chamar("registrar_contato_prefeitura", {
        p_prefeitura_id: entrada.prefeituraId,
        p_nome: entrada.nome.trim(),
        p_funcao: entrada.funcao?.trim() || null,
        p_decisor: entrada.decisor,
        p_contato: entrada.contato?.trim() || null,
        p_observacao: entrada.observacao?.trim() || null,
      }),
    onSuccess: () => void invalidar(),
  });
}

export function useRegistrarInteracao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      oportunidadeId: string;
      tipo: string;
      descricao: string;
      ocorridoEm: string;
    }) =>
      chamar("registrar_interacao_prefeitura", {
        p_oportunidade_id: entrada.oportunidadeId,
        p_tipo: entrada.tipo,
        p_descricao: entrada.descricao.trim(),
        p_ocorrido_em: entrada.ocorridoEm,
      }),
    onSuccess: () => void invalidar(),
  });
}

/** Meta da frente: histórico por vigência, encaixe cronológico feito no banco. */
export function useCadastrarMetaPrefeitura() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      indicador: MetaPrefeitura["indicador"];
      valor: number;
      vigenciaInicio: string;
    }) => {
      const usuario = await usuarioAtual();
      const { error } = await cliente().from("prefeitura_metas").insert({
        indicador: entrada.indicador,
        valor: entrada.valor,
        vigencia_inicio: entrada.vigenciaInicio,
        created_by: usuario,
      });
      if (error) {
        throw new Error(
          error.code === "23505"
            ? "Já existe meta deste indicador com essa data de início."
            : error.message,
        );
      }
    },
    onSuccess: () => void invalidar(),
  });
}
