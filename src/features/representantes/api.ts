import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Supervisor = { id: string; slug: string; nome: string };

/** Carteira do supervisor NA DATA DE REFERÊNCIA (função f_carteira_referencia). */
export type RepresentanteCarteira = {
  id: string;
  nome: string;
  data_cadastro: string;
  observacao: string | null;
  supervisor_id: string;
  supervisor_slug: string;
  supervisor_nome: string;
  /** Última produção válida até a referência. `null` = nenhuma produção conhecida. */
  ultima_producao: string | null;
  /** Contratos válidos até a referência. `null` = ausência de produção (não é zero). */
  contratos_ate_referencia: number | null;
};

/** Produção válida já atribuída ao supervisor vigente na data do fato. */
export type ProducaoAtribuida = {
  id: string;
  representante_id: string;
  representante_nome: string;
  data_producao: string;
  quantidade: number;
  origem: string;
  observacao: string | null;
  supervisor_id: string;
  supervisor_slug: string;
};

/** Reativação derivada (view v_reativacoes) — nunca armazenada. */
export type ReativacaoDerivada = {
  representante_id: string;
  ocorrido_em: string;
  producao_anterior: string;
  dias_sem_producao: number;
  supervisor_id: string;
};

export type CaptacaoAtribuida = {
  representante_id: string;
  nome: string;
  data_cadastro: string;
  supervisor_id: string;
};

export type EventoRepresentante = {
  id: string;
  representante_id: string;
  tipo: "cadastro" | "mudanca_supervisor";
  ocorrido_em: string;
  detalhe: string | null;
};

export type ProducaoRegistro = {
  id: string;
  representante_id: string;
  data_producao: string;
  quantidade: number;
  origem: string;
  observacao: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
};

export type Meta = {
  id: string;
  supervisor_id: string;
  indicador: "contratos_mes" | "representantes_ativos";
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

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

async function buscarSupervisor(slug: string): Promise<Supervisor> {
  const { data, error } = await cliente()
    .from("supervisores")
    .select("id, slug, nome")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contexto de supervisão não encontrado no banco de dados.");
  return data as Supervisor;
}

const chave = {
  supervisor: (slug: string) => ["representantes", "supervisor", slug] as const,
  carteira: (slug: string, referencia: string) =>
    ["representantes", "carteira", slug, referencia] as const,
  carteiraAtual: (slug: string) => ["representantes", "carteira-atual", slug] as const,
  producoes: (slug: string, periodo: string) =>
    ["representantes", "producoes", slug, periodo] as const,
  reativacoes: (slug: string, periodo: string) =>
    ["representantes", "reativacoes", slug, periodo] as const,
  captacao: (slug: string, periodo: string) =>
    ["representantes", "captacao", slug, periodo] as const,
  metas: (slug: string, periodo: string) => ["representantes", "metas", slug, periodo] as const,
  historico: (id: string) => ["representantes", "historico", id] as const,
};

export function useSupervisor(slug: string) {
  return useQuery({
    queryKey: chave.supervisor(slug),
    queryFn: () => buscarSupervisor(slug),
  });
}

/** Carteira do supervisor na data de referência (status histórico correto). */
export function useCarteiraReferencia(slug: string, referenciaISO: string, supervisorId?: string) {
  return useQuery({
    queryKey: chave.carteira(slug, referenciaISO),
    enabled: Boolean(supervisorId),
    queryFn: async (): Promise<RepresentanteCarteira[]> => {
      const { data, error } = await cliente().rpc("f_carteira_referencia", {
        p_supervisor_id: supervisorId!,
        p_referencia: referenciaISO,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha["id"]),
        nome: String(linha["nome"]),
        data_cadastro: String(linha["data_cadastro"]),
        observacao: (linha["observacao"] as string | null) ?? null,
        supervisor_id: String(linha["supervisor_id"]),
        supervisor_slug: String(linha["supervisor_slug"]),
        supervisor_nome: String(linha["supervisor_nome"]),
        ultima_producao: (linha["ultima_producao"] as string | null) ?? null,
        contratos_ate_referencia: numeroOuNulo(linha["contratos_ate_referencia"]),
      }));
    },
  });
}

/** Carteira atual (vínculo aberto) — usada apenas para selecionar destino de escrita. */
export function useCarteiraAtual(slug: string) {
  return useQuery({
    queryKey: chave.carteiraAtual(slug),
    queryFn: async (): Promise<Array<{ id: string; nome: string }>> => {
      const { data, error } = await cliente()
        .from("v_representantes_carteira")
        .select("id, nome")
        .eq("supervisor_slug", slug)
        .order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });
}

/** Produção do período JÁ atribuída ao supervisor vigente na data do fato. */
export function useProducoesPeriodo(
  slug: string,
  periodo: string,
  intervalo: { inicio: string; fim: string },
  supervisorId?: string,
) {
  return useQuery({
    queryKey: chave.producoes(slug, periodo),
    enabled: Boolean(supervisorId),
    queryFn: async (): Promise<ProducaoAtribuida[]> => {
      const { data, error } = await cliente()
        .from("v_producoes_atribuidas")
        .select(
          "id, representante_id, representante_nome, data_producao, quantidade, origem, observacao, supervisor_id, supervisor_slug",
        )
        .eq("supervisor_id", supervisorId!)
        .gte("data_producao", intervalo.inicio)
        .lte("data_producao", intervalo.fim);
      if (error) throw new Error(error.message);
      return (data ?? []) as ProducaoAtribuida[];
    },
  });
}

export function useReativacoesPeriodo(
  slug: string,
  periodo: string,
  intervalo: { inicio: string; fim: string },
  supervisorId?: string,
) {
  return useQuery({
    queryKey: chave.reativacoes(slug, periodo),
    enabled: Boolean(supervisorId),
    queryFn: async (): Promise<ReativacaoDerivada[]> => {
      const { data, error } = await cliente()
        .from("v_reativacoes")
        .select(
          "representante_id, ocorrido_em, producao_anterior, dias_sem_producao, supervisor_id",
        )
        .eq("supervisor_id", supervisorId!)
        .gte("ocorrido_em", intervalo.inicio)
        .lte("ocorrido_em", intervalo.fim);
      if (error) throw new Error(error.message);
      return (data ?? []) as ReativacaoDerivada[];
    },
  });
}

export function useCaptacaoPeriodo(
  slug: string,
  periodo: string,
  intervalo: { inicio: string; fim: string },
  supervisorId?: string,
) {
  return useQuery({
    queryKey: chave.captacao(slug, periodo),
    enabled: Boolean(supervisorId),
    queryFn: async (): Promise<CaptacaoAtribuida[]> => {
      const { data, error } = await cliente()
        .from("v_captacao_atribuida")
        .select("representante_id, nome, data_cadastro, supervisor_id")
        .eq("supervisor_id", supervisorId!)
        .gte("data_cadastro", intervalo.inicio)
        .lte("data_cadastro", intervalo.fim);
      if (error) throw new Error(error.message);
      return (data ?? []) as CaptacaoAtribuida[];
    },
  });
}

/** Metas vigentes no período (nunca sobrescritas: vale a vigência mais recente). */
export function useMetasVigentes(
  slug: string,
  periodo: string,
  intervalo: { inicio: string; fim: string },
  supervisorId?: string,
) {
  return useQuery({
    queryKey: chave.metas(slug, periodo),
    enabled: Boolean(supervisorId),
    queryFn: async (): Promise<Meta[]> => {
      const { data, error } = await cliente()
        .from("metas")
        .select("id, supervisor_id, indicador, valor, vigencia_inicio, vigencia_fim")
        .eq("supervisor_id", supervisorId!)
        .lte("vigencia_inicio", intervalo.fim)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Meta[]).filter(
        (meta) => meta.vigencia_fim === null || meta.vigencia_fim >= intervalo.inicio,
      );
    },
  });
}

export type Historico = {
  producoes: ProducaoRegistro[];
  eventos: EventoRepresentante[];
  reativacoes: ReativacaoDerivada[];
  vinculos: Array<{ id: string; inicio: string; fim: string | null; supervisor_nome: string }>;
};

export function useHistorico(representanteId: string | null) {
  return useQuery({
    queryKey: chave.historico(representanteId ?? "—"),
    enabled: Boolean(representanteId),
    queryFn: async (): Promise<Historico> => {
      const db = cliente();
      const [producoes, eventos, reativacoes, vinculos] = await Promise.all([
        db
          .from("producoes")
          .select(
            "id, representante_id, data_producao, quantidade, origem, observacao, cancelada_em, motivo_cancelamento",
          )
          .eq("representante_id", representanteId!)
          .order("data_producao", { ascending: false }),
        db
          .from("representante_eventos")
          .select("id, representante_id, tipo, ocorrido_em, detalhe")
          .eq("representante_id", representanteId!)
          .order("ocorrido_em", { ascending: false }),
        db
          .from("v_reativacoes")
          .select(
            "representante_id, ocorrido_em, producao_anterior, dias_sem_producao, supervisor_id",
          )
          .eq("representante_id", representanteId!)
          .order("ocorrido_em", { ascending: false }),
        db
          .from("representante_vinculos")
          .select("id, inicio, fim, supervisores(nome)")
          .eq("representante_id", representanteId!)
          .order("inicio", { ascending: false }),
      ]);

      const erro = producoes.error ?? eventos.error ?? reativacoes.error ?? vinculos.error;
      if (erro) throw new Error(erro.message);

      return {
        producoes: (producoes.data ?? []) as ProducaoRegistro[],
        eventos: (eventos.data ?? []) as EventoRepresentante[],
        reativacoes: (reativacoes.data ?? []) as ReativacaoDerivada[],
        vinculos: ((vinculos.data ?? []) as never[]).map((linha: never) => {
          const item = linha as unknown as {
            id: string;
            inicio: string;
            fim: string | null;
            supervisores: { nome: string } | { nome: string }[] | null;
          };
          const supervisor = Array.isArray(item.supervisores)
            ? item.supervisores[0]
            : item.supervisores;
          return {
            id: item.id,
            inicio: item.inicio,
            fim: item.fim,
            supervisor_nome: supervisor?.nome ?? "—",
          };
        }),
      };
    },
  });
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["representantes"] });
}

/** Cadastro atômico: representante + vínculo + evento (função no banco). */
export function useCriarRepresentante() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      codigo: string;
      nome: string;
      supervisorId: string;
      dataCadastro: string;
      observacao?: string;
      /** Valor padrão por contrato. `null` = não cadastrado (nunca zero). */
      valorPremiacaoContrato?: number | null;
      /** Quanto recebe por contrato da equipe, quando for líder. */
      valorComissaoLideranca?: number | null;
      metaMinimaMensal?: number | null;
      /** Líder ao qual este representante fica filiado, se houver. */
      liderId?: string | null;
    }) => {
      const { data, error } = await cliente().rpc("criar_representante", {
        p_codigo: entrada.codigo.trim(),
        p_nome: entrada.nome.trim(),
        p_supervisor_id: entrada.supervisorId,
        p_data_cadastro: entrada.dataCadastro,
        p_observacao: entrada.observacao?.trim() || null,
        p_valor_premiacao_contrato: entrada.valorPremiacaoContrato ?? null,
        p_valor_comissao_lideranca: entrada.valorComissaoLideranca ?? null,
        p_meta_minima_mensal: entrada.metaMinimaMensal ?? null,
      });
      if (error) {
        throw new Error(
          error.code === "23505"
            ? "Já existe um representante cadastrado com esse código ou nome."
            : error.message,
        );
      }

      // Filiação é um fato separado do cadastro: só grava quando informada.
      if (entrada.liderId) {
        const novoId = typeof data === "string" ? data : null;
        if (!novoId) {
          throw new Error(
            "Representante cadastrado, mas não foi possível vinculá-lo ao líder. Defina a filiação pelo cadastro.",
          );
        }
        const { error: erroLider } = await cliente().rpc("definir_lider_representante", {
          p_representante_id: novoId,
          p_lider_id: entrada.liderId,
          p_data: entrada.dataCadastro,
        });
        if (erroLider) {
          throw new Error(
            `Representante cadastrado, mas a filiação ao líder falhou: ${erroLider.message}`,
          );
        }
      }
    },
    onSuccess: () => void invalidar(),
  });
}

/** Edição dos valores de premiação/meta já cadastrados. */
export function useAtualizarValoresRepresentante() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      representanteId: string;
      valorPremiacaoContrato: number | null;
      valorComissaoLideranca: number | null;
      metaMinimaMensal: number | null;
    }) => {
      const { error } = await cliente().rpc("atualizar_valores_representante", {
        p_representante_id: entrada.representanteId,
        p_valor_premiacao_contrato: entrada.valorPremiacaoContrato,
        p_valor_comissao_lideranca: entrada.valorComissaoLideranca,
        p_meta_minima_mensal: entrada.metaMinimaMensal,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useRegistrarProducao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      representanteId: string;
      dataProducao: string;
      quantidade: number;
      observacao?: string;
    }) => {
      const usuario = await usuarioAtual();
      const { error } = await cliente()
        .from("producoes")
        .insert({
          representante_id: entrada.representanteId,
          data_producao: entrada.dataProducao,
          quantidade: entrada.quantidade,
          origem: "registro_manual",
          observacao: entrada.observacao?.trim() || null,
          created_by: usuario,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

/** Correção segura: cancelamento rastreável no banco, sem apagar o fato. */
export function useCancelarProducao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: { producaoId: string; motivo: string }) => {
      const { error } = await cliente().rpc("cancelar_producao", {
        p_producao_id: entrada.producaoId,
        p_motivo: entrada.motivo.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}

export function useCadastrarMeta() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (entrada: {
      supervisorId: string;
      indicador: Meta["indicador"];
      valor: number;
      vigenciaInicio: string;
      vigenciaFim?: string | null;
    }) => {
      const usuario = await usuarioAtual();
      const { error } = await cliente()
        .from("metas")
        .insert({
          supervisor_id: entrada.supervisorId,
          indicador: entrada.indicador,
          valor: entrada.valor,
          vigencia_inicio: entrada.vigenciaInicio,
          vigencia_fim: entrada.vigenciaFim || null,
          created_by: usuario,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void invalidar(),
  });
}
