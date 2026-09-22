/**
 * Desenha a ordem de pagamento no formato do formulário impresso da DS3.
 *
 * É canvas puro de propósito. O projeto usa Tailwind 4, cujas cores são
 * `oklch`; as bibliotecas de "HTML para imagem" não leem esse formato e
 * devolvem a folha com as cores erradas. Desenhando direto, o resultado é
 * sempre o mesmo em qualquer navegador e não entra dependência nova.
 */

export type LinhaImagem = {
  rotulo: string;
  data: string;
  valor: string;
  observacao: string;
  /** "normal" preto, "destaque" azul (adiantamento), "negativo" vermelho. */
  cor: "normal" | "destaque" | "negativo";
};

export type DadosOrdemImagem = {
  /** Cabeçalho: supervisor e data, como "BERG CALASANS 04/09/2026". */
  supervisor: string;
  data: string;
  /** "3840 - CLAUDIO CARDOSO" */
  representante: string;
  linhas: LinhaImagem[];
  /** Rodapé: conta do representante e conta do supervisor. */
  contaRepresentante: string;
  totalRepresentante: string;
  contaSupervisor: string;
  totalSupervisor: string;
};

const ESCALA = 2; // desenha em dobro e exibe na metade: fica nítido em tela e impresso

const LARGURA = 770;
const PAD = 6;
const ALTURA_MINIMA_LINHA = 19;
const ALTURA_TITULO = 26;
const ALTURA_CABECALHO = 26;

const COL = [0, 0.4, 0.53, 0.655, 1] as const;

const COR = {
  borda: "#1F4E79",
  grade: "#000000",
  cabecalho: "#CCC0DA",
  fundo: "#FFFFFF",
  texto: "#000000",
  destaque: "#0070C0",
  negativo: "#FF0000",
} as const;

const FONTE_ROTULO = "bold 11px Arial, Helvetica, sans-serif";
const FONTE_VALOR = "bold 11px Arial, Helvetica, sans-serif";
const FONTE_OBS = "bold 10px Arial, Helvetica, sans-serif";
const FONTE_CONTA = "bold 9px Arial, Helvetica, sans-serif";

function corDe(cor: LinhaImagem["cor"]): string {
  if (cor === "destaque") return COR.destaque;
  if (cor === "negativo") return COR.negativo;
  return COR.texto;
}

/** Quebra o texto em linhas que cabem na largura dada. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  if (!texto) return [];
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function x(fracao: number): number {
  return Math.round(fracao * LARGURA);
}

/** Desenha e devolve o canvas pronto. */
export function desenharOrdem(dados: DadosOrdemImagem): HTMLCanvasElement {
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) throw new Error("Canvas indisponível neste navegador.");
  medidor.font = FONTE_OBS;

  const larguraObs = x(COL[4]) - x(COL[3]) - PAD * 2;

  // 1) mede cada linha para saber a altura total antes de desenhar
  const medidas = dados.linhas.map((linha) => {
    const obs = quebrar(medidor, linha.observacao, larguraObs);
    const altura = Math.max(ALTURA_MINIMA_LINHA, obs.length * 13 + 6);
    return { linha, obs, altura };
  });

  const alturaContas = 34;
  const altura =
    ALTURA_TITULO +
    ALTURA_CABECALHO +
    medidas.reduce((soma, m) => soma + m.altura, 0) +
    alturaContas * 2;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = "middle";

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);

  let y = 0;

  // 2) título: supervisor e data
  ctx.strokeStyle = COR.grade;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, LARGURA - 1, ALTURA_TITULO);
  ctx.fillStyle = COR.texto;
  ctx.font = FONTE_ROTULO;
  ctx.textAlign = "left";
  ctx.fillText(`${dados.supervisor}   ${dados.data}`.trim(), PAD, y + ALTURA_TITULO / 2);
  y += ALTURA_TITULO;

  // 3) cabeçalho das colunas
  ctx.fillStyle = COR.cabecalho;
  ctx.fillRect(0, y, LARGURA, ALTURA_CABECALHO);
  ctx.fillStyle = COR.texto;
  ctx.font = "bold 12px Arial, Helvetica, sans-serif";
  const meioCabecalho = y + ALTURA_CABECALHO / 2;
  ctx.textAlign = "left";
  ctx.fillText(dados.representante, PAD, meioCabecalho);
  ctx.textAlign = "center";
  ctx.fillText("DATA", (x(COL[1]) + x(COL[2])) / 2, meioCabecalho);
  ctx.fillText("R$:", (x(COL[2]) + x(COL[3])) / 2, meioCabecalho);
  ctx.fillText("OBSERVAÇÃO:", (x(COL[3]) + x(COL[4])) / 2, meioCabecalho);

  for (const c of COL) {
    ctx.beginPath();
    ctx.moveTo(x(c) + 0.5, y);
    ctx.lineTo(x(c) + 0.5, y + ALTURA_CABECALHO);
    ctx.stroke();
  }
  ctx.strokeRect(0.5, y + 0.5, LARGURA - 1, ALTURA_CABECALHO);
  y += ALTURA_CABECALHO;

  // 4) as rubricas
  for (const { linha, obs, altura: alturaLinha } of medidas) {
    const cor = corDe(linha.cor);

    ctx.strokeStyle = COR.grade;
    ctx.strokeRect(0.5, y + 0.5, LARGURA - 1, alturaLinha);
    for (const c of COL) {
      ctx.beginPath();
      ctx.moveTo(x(c) + 0.5, y);
      ctx.lineTo(x(c) + 0.5, y + alturaLinha);
      ctx.stroke();
    }

    // rótulo, data e valor partilham a mesma linha de base, centrados na
    // altura da linha — inclusive quando a observação estica a linha
    const meio = y + alturaLinha / 2;

    ctx.fillStyle = cor;
    ctx.font = FONTE_ROTULO;
    ctx.textAlign = "left";
    ctx.fillText(`${linha.rotulo}:`, PAD, meio);

    ctx.font = FONTE_VALOR;
    ctx.textAlign = "center";
    if (linha.data) {
      ctx.fillText(linha.data, (x(COL[1]) + x(COL[2])) / 2, meio);
    }
    if (linha.valor) {
      ctx.fillText(linha.valor, (x(COL[2]) + x(COL[3])) / 2, meio);
    }

    ctx.font = FONTE_OBS;
    ctx.textAlign = "left";
    obs.forEach((texto, indice) => {
      ctx.fillText(texto, x(COL[3]) + PAD, y + 10 + indice * 13);
    });

    y += alturaLinha;
  }

  // 5) rodapé: as duas contas, cada uma com seu total
  const contas: Array<[string, string]> = [
    [dados.contaRepresentante, dados.totalRepresentante],
    [dados.contaSupervisor, dados.totalSupervisor],
  ];

  for (const [conta, total] of contas) {
    ctx.fillStyle = COR.cabecalho;
    ctx.fillRect(0, y, x(COL[1]), alturaContas);
    ctx.strokeStyle = COR.grade;
    ctx.strokeRect(0.5, y + 0.5, LARGURA - 1, alturaContas);
    for (const c of COL) {
      ctx.beginPath();
      ctx.moveTo(x(c) + 0.5, y);
      ctx.lineTo(x(c) + 0.5, y + alturaContas);
      ctx.stroke();
    }

    ctx.fillStyle = COR.texto;
    ctx.font = FONTE_CONTA;
    ctx.textAlign = "center";
    const partes = quebrar(ctx, conta, x(COL[1]) - PAD * 2);
    partes.slice(0, 2).forEach((texto, indice) => {
      ctx.fillText(texto, x(COL[1]) / 2, y + 12 + indice * 11);
    });

    ctx.font = "bold 12px Arial, Helvetica, sans-serif";
    ctx.fillText("TOTAL:", (x(COL[1]) + x(COL[2])) / 2, y + alturaContas / 2);
    if (total) {
      ctx.fillText(total, (x(COL[2]) + x(COL[3])) / 2, y + alturaContas / 2);
    }
    y += alturaContas;
  }

  // 6) moldura
  ctx.strokeStyle = COR.borda;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, LARGURA - 2, altura - 2);

  return canvas;
}

/**
 * Salva o canvas como PNG.
 *
 * O link precisa estar no documento para o clique valer em todo navegador,
 * e o endereço temporário só pode ser liberado depois que o download
 * começou — liberar na linha seguinte ao clique cancela o próprio
 * download em parte dos navegadores.
 */
export function baixarPng(canvas: HTMLCanvasElement, nome: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, "image/png");
}
