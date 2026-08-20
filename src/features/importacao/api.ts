import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LinhaAnalisada, RepresentanteIndice } from "./dominio";

export type Lote = {
  id: string;
  frente: string;
  nome_arquivo: string;
  hash_arquivo: string;
  status: string;
  total_linhas: number;
  linhas_importadas: number;
  linhas_duplicadas: number;
  linhas_rejeitadas: number;
  iniciado_em: string;
  concluido_em: string | null;
};

export type LinhaLote = {
  id: string;
  numero_linha: number;
  status: string;
  motivo_rejeicao: string | null;
  chave_negocio: string | null;
};

function cliente() {
  if (!supabase) throw new Error("Backend não configurado.");
  return supabase;
}

const chave = {
  representantes: ["importacao", "representantes-indice"] as const,
  lotes: ["importacao", "lotes"] as const,
  linhas: (loteId: string) => ["importacao", "linhas", loteId] as const,
};

export function useRepresentantesIndice() {
  return useQuery({
    queryKey: chave.representantes,
    queryFn: async (): Promise<RepresentanteIndice[]> => {
      const { data, error } = await cliente()
        .from("representantes")
        .select("id, nome, codigo")
        .order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as RepresentanteIndice[];
    },
  });
}

export function useLotes(frente = "representantes") {
  return useQuery({
    queryKey: chave.lotes,
    queryFn: async (): Promise<Lote[]> => {
      const { data, error } = await cliente()
        .from("importacao_lotes")
        .select(
          "id, frente, nome_arquivo, hash_arquivo, status, total_linhas, linhas_importadas, linhas_duplicadas, linhas_rejeitadas, iniciado_em, concluido_em",
        )
        .eq("frente", frente)
        .order("iniciado_em", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Lote[];
    },
  });
}

export function useLinhasLote(loteId: string | null) {
  return useQuery({
    queryKey: chave.linhas(loteId ?? "—"),
    enabled: Boolean(loteId),
    queryFn: async (): Promise<LinhaLote[]> => {
      const { data, error } = await cliente()
        .from("importacao_linhas")
        .select("id, numero_linha, status, motivo_rejeicao, chave_negocio")
        .eq("lote_id", loteId!)
        .order("numero_linha");
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaLote[];
    },
  });
}

/** Já existe um lote confirmado com este arquivo? (idempotência por conteúdo) */
export async function loteJaConfirmado(hashArquivo: string): Promise<Lote | null> {
  const { data, error } = await cliente()
    .from("importacao_lotes")
    .select(
      "id, frente, nome_arquivo, hash_arquivo, status, total_linhas, linhas_importadas, linhas_duplicadas, linhas_rejeitadas, iniciado_em, concluido_em",
    )
    .eq("hash_arquivo", hashArquivo)
    .eq("status", "confirmado")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Lote | null) ?? null;
}

/** Chaves de negócio já existentes no banco, para marcar duplicidades na prévia. */
export async function buscarChavesExistentes(codigos: string[]): Promise<Set<string>> {
  const chaves = new Set<string>();
  const unicos = Array.from(new Set(codigos.map((codigo) => codigo.toUpperCase())));
  const tamanho = 200;

  for (let inicio = 0; inicio < unicos.length; inicio += tamanho) {
    const fatia = unicos.slice(inicio, inicio + tamanho);
    const { data, error } = await cliente()
      .from("representante_contratos")
      .select("codigo_contrato_norm, representante_id, data_venda")
      .is("cancelado_em", null)
      .in("codigo_contrato_norm", fatia);
    if (error) throw new Error(error.message);
    for (const linha of (data ?? []) as Array<{
      codigo_contrato_norm: string;
      representante_id: string;
      data_venda: string;
    }>) {
      chaves.add(`${linha.codigo_contrato_norm}|${linha.representante_id}|${linha.data_venda}`);
    }
  }
  return chaves;
}

export type ResumoConfirmacao = {
  lote_id: string;
  importadas: number;
  duplicadas: number;
  rejeitadas: number;
};

export function useConfirmarImportacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: {
      nomeArquivo: string;
      hashArquivo: string;
      tamanhoBytes: number;
      totalLinhas: number;
      linhas: LinhaAnalisada[];
    }): Promise<ResumoConfirmacao> => {
      const payload = entrada.linhas.map((linha) => ({
        numero_linha: linha.numero_linha,
        hash_linha: linha.hash_linha,
        motivo_rejeicao: linha.motivo_rejeicao,
        payload: linha.payload ?? {},
      }));

      const { data, error } = await cliente().rpc("confirmar_importacao_representantes", {
        p_nome_arquivo: entrada.nomeArquivo,
        p_hash_arquivo: entrada.hashArquivo,
        p_tamanho_bytes: entrada.tamanhoBytes,
        p_total_linhas: entrada.totalLinhas,
        p_linhas: payload,
      });
      if (error) throw new Error(error.message);
      return data as ResumoConfirmacao;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importacao"] });
      void queryClient.invalidateQueries({ queryKey: ["representantes"] });
    },
  });
}
