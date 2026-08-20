/**
 * Regras puras de importação — frente Representantes.
 *
 * Princípios:
 *   * Ausência nunca vira zero, falso ou "hoje": vira NULL ou rejeição.
 *   * Nada é resolvido por aproximação (nome ambíguo/inexistente = rejeição).
 *   * O cliente apenas propõe; a autoridade final é a função no banco.
 */

export const COLUNAS_OFICIAIS = [
  "Data da venda",
  "Representante",
  "Código do cliente",
  "CNPJ",
  "Código do contrato",
  "Tipo de contrato",
  "Premiável?",
  "Motivo não premiável",
  "Pendência?",
  "Tipo de pendência",
  "Pago?",
  "Tipo de pagamento",
] as const;

export const TIPOS_PENDENCIA_CONHECIDOS = [
  "contrato assinado",
  "documento de identificação",
  "preenchimento",
  "mais de uma pendência",
] as const;

export type CelulaBruta = string | number | boolean | Date | null | undefined;

export type PayloadContrato = {
  data_venda: string;
  representante_id: string;
  codigo_cliente: string | null;
  cnpj: string | null;
  codigo_contrato: string;
  tipo_contrato_origem: string | null;
  premiavel: boolean;
  motivo_nao_premiavel_origem: string | null;
  possui_pendencia: boolean;
  tipo_pendencia_origem: string | null;
  pago_informado_origem: boolean;
  tipo_pagamento_informado_origem: "normal" | "adiantamento" | null;
};

export type LinhaAnalisada = {
  numero_linha: number;
  hash_linha: string;
  status: "nova" | "duplicada" | "rejeitada";
  motivo_rejeicao: string | null;
  chave_negocio: string | null;
  representante_nome: string | null;
  payload: PayloadContrato | null;
};

export type ResultadoAnalise = {
  linhas: LinhaAnalisada[];
  total: number;
  novas: number;
  duplicadas: number;
  rejeitadas: number;
};

export type RepresentanteIndice = { id: string; nome: string; codigo: string };

/** Normalização técnica segura: acentos, caixa e espaços excedentes. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizarCabecalho(valor: CelulaBruta): string {
  return normalizarTexto(String(valor ?? "")).replace(/[?:.]/g, "");
}

/** Confere o cabeçalho oficial. Estrutura incompatível nunca é aceita em silêncio. */
export function validarCabecalho(cabecalho: CelulaBruta[]): {
  ok: boolean;
  faltando: string[];
  indices: Record<string, number>;
} {
  const encontrados = cabecalho.map(normalizarCabecalho);
  const indices: Record<string, number> = {};
  const faltando: string[] = [];

  for (const coluna of COLUNAS_OFICIAIS) {
    const alvo = normalizarCabecalho(coluna);
    const posicao = encontrados.indexOf(alvo);
    if (posicao === -1) faltando.push(coluna);
    else indices[coluna] = posicao;
  }

  return { ok: faltando.length === 0, faltando, indices };
}

function texto(valor: CelulaBruta): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return null;
  const bruto = String(valor).replace(/\s+/g, " ").trim();
  return bruto === "" ? null : bruto;
}

/** Data: nunca substituída por hoje; formato inválido rejeita a linha. */
export function lerData(valor: CelulaBruta): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  const bruto = texto(valor);
  if (!bruto) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(bruto);
  let ano: number, mes: number, dia: number;

  if (iso) [, ano, mes, dia] = [0, Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [, dia, mes, ano] = [0, Number(br[1]), Number(br[2]), Number(br[3])];
  else return null;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  if (ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Sim/Não estrito. Vazio é ausência (null), nunca "não". */
export function lerSimNao(valor: CelulaBruta): boolean | null | "invalido" {
  if (typeof valor === "boolean") return valor;
  const bruto = texto(valor);
  if (!bruto) return null;
  const normalizado = normalizarTexto(bruto);
  if (["sim", "s", "true", "1"].includes(normalizado)) return true;
  if (["nao", "n", "false", "0"].includes(normalizado)) return false;
  return "invalido";
}

export function lerCnpj(valor: CelulaBruta): string | null | "invalido" {
  const bruto = texto(valor);
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length !== 14) return "invalido";
  if (/^0+$/.test(digitos)) return "invalido";
  return digitos;
}

export async function hashSha256(dados: ArrayBuffer | string): Promise<string> {
  const buffer = typeof dados === "string" ? new TextEncoder().encode(dados).buffer : dados;
  const digest = await crypto.subtle.digest("SHA-256", buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function indiceRepresentantes(lista: RepresentanteIndice[]) {
  const porNome = new Map<string, RepresentanteIndice[]>();
  const porCodigo = new Map<string, RepresentanteIndice>();
  for (const item of lista) {
    const chave = normalizarTexto(item.nome);
    porNome.set(chave, [...(porNome.get(chave) ?? []), item]);
    porCodigo.set(normalizarTexto(item.codigo), item);
  }
  return { porNome, porCodigo };
}

/**
 * Analisa as linhas já lidas da planilha.
 * `chavesExistentes` = chaves de negócio já presentes no banco (não canceladas).
 */
export async function analisarLinhas(
  linhas: CelulaBruta[][],
  indices: Record<string, number>,
  representantes: RepresentanteIndice[],
  chavesExistentes: Set<string>,
): Promise<ResultadoAnalise> {
  const indice = indiceRepresentantes(representantes);
  const vistas = new Set<string>();
  const resultado: LinhaAnalisada[] = [];

  for (let posicao = 0; posicao < linhas.length; posicao += 1) {
    const linha = linhas[posicao] ?? [];
    const numero = posicao + 2; // linha 1 = cabeçalho
    const valor = (coluna: string): CelulaBruta => linha[indices[coluna] ?? -1];
    const hash = await hashSha256(
      linha
        .map((celula) => (celula instanceof Date ? celula.toISOString() : String(celula ?? "")))
        .join("|"),
    );

    const rejeitar = (motivo: string, nome: string | null = null) => {
      resultado.push({
        numero_linha: numero,
        hash_linha: hash,
        status: "rejeitada",
        motivo_rejeicao: motivo,
        chave_negocio: null,
        representante_nome: nome,
        payload: null,
      });
    };

    const vazia = linha.every((celula) => texto(celula) === null && !(celula instanceof Date));
    if (vazia) continue;

    const dataVenda = lerData(valor("Data da venda"));
    if (!dataVenda) {
      rejeitar("Data da venda ausente ou inválida.");
      continue;
    }

    const nomeBruto = texto(valor("Representante"));
    if (!nomeBruto) {
      rejeitar("Representante não informado.");
      continue;
    }
    const candidatos =
      indice.porCodigo.get(normalizarTexto(nomeBruto)) !== undefined
        ? [indice.porCodigo.get(normalizarTexto(nomeBruto))!]
        : (indice.porNome.get(normalizarTexto(nomeBruto)) ?? []);
    if (candidatos.length === 0) {
      rejeitar("Representante não cadastrado no sistema.", nomeBruto);
      continue;
    }
    if (candidatos.length > 1) {
      rejeitar("Representante ambíguo: mais de um cadastro com esse nome.", nomeBruto);
      continue;
    }
    const representante = candidatos[0]!;

    const codigoContrato = texto(valor("Código do contrato"));
    if (!codigoContrato) {
      rejeitar("Código do contrato ausente.", nomeBruto);
      continue;
    }

    const codigoCliente = texto(valor("Código do cliente"));
    if (!codigoCliente) {
      rejeitar("Código do cliente ausente.", nomeBruto);
      continue;
    }

    const cnpj = lerCnpj(valor("CNPJ"));
    if (cnpj === "invalido") {
      rejeitar("CNPJ inválido.", nomeBruto);
      continue;
    }

    const premiavel = lerSimNao(valor("Premiável?"));
    if (premiavel === null) {
      rejeitar('Campo "Premiável?" ausente.', nomeBruto);
      continue;
    }
    if (premiavel === "invalido") {
      rejeitar('Campo "Premiável?" deve ser Sim ou Não.', nomeBruto);
      continue;
    }
    const motivoNaoPremiavel = texto(valor("Motivo não premiável"));
    if (!premiavel && !motivoNaoPremiavel) {
      rejeitar("Motivo obrigatório quando não premiável.", nomeBruto);
      continue;
    }

    const pendencia = lerSimNao(valor("Pendência?"));
    if (pendencia === null) {
      rejeitar('Campo "Pendência?" ausente.', nomeBruto);
      continue;
    }
    if (pendencia === "invalido") {
      rejeitar('Campo "Pendência?" deve ser Sim ou Não.', nomeBruto);
      continue;
    }
    const tipoPendencia = texto(valor("Tipo de pendência"));
    if (pendencia && !tipoPendencia) {
      rejeitar("Tipo de pendência obrigatório.", nomeBruto);
      continue;
    }

    const pago = lerSimNao(valor("Pago?"));
    if (pago === null) {
      rejeitar('Campo "Pago?" ausente.', nomeBruto);
      continue;
    }
    if (pago === "invalido") {
      rejeitar('Campo "Pago?" deve ser Sim ou Não.', nomeBruto);
      continue;
    }

    const tipoPagamentoBruto = texto(valor("Tipo de pagamento"));
    let tipoPagamento: "normal" | "adiantamento" | null = null;
    if (tipoPagamentoBruto) {
      const normalizado = normalizarTexto(tipoPagamentoBruto);
      if (normalizado === "normal") tipoPagamento = "normal";
      else if (normalizado === "adiantamento") tipoPagamento = "adiantamento";
      else {
        rejeitar("Tipo de pagamento deve ser Normal ou Adiantamento.", nomeBruto);
        continue;
      }
    }

    const chave = `${codigoContrato.toUpperCase()}|${representante.id}|${dataVenda}`;
    const duplicada = chavesExistentes.has(chave) || vistas.has(chave);
    vistas.add(chave);

    resultado.push({
      numero_linha: numero,
      hash_linha: hash,
      status: duplicada ? "duplicada" : "nova",
      motivo_rejeicao: null,
      chave_negocio: chave,
      representante_nome: representante.nome,
      payload: {
        data_venda: dataVenda,
        representante_id: representante.id,
        codigo_cliente: codigoCliente,
        cnpj: cnpj,
        codigo_contrato: codigoContrato,
        tipo_contrato_origem: texto(valor("Tipo de contrato")),
        premiavel,
        motivo_nao_premiavel_origem: motivoNaoPremiavel,
        possui_pendencia: pendencia,
        tipo_pendencia_origem: tipoPendencia,
        pago_informado_origem: pago,
        tipo_pagamento_informado_origem: tipoPagamento,
      },
    });
  }

  return {
    linhas: resultado,
    total: resultado.length,
    novas: resultado.filter((linha) => linha.status === "nova").length,
    duplicadas: resultado.filter((linha) => linha.status === "duplicada").length,
    rejeitadas: resultado.filter((linha) => linha.status === "rejeitada").length,
  };
}
