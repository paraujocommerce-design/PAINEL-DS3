import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ClassicButton, LoadingState, Toolbar, ToolbarSeparator } from "@/components/w2k";
import { useLinhasOrdem, useRubricas, type OrdemPagamento } from "./api";
import { baixarPng, desenharOrdem, type DadosOrdemImagem, type LinhaImagem } from "./ordem-desenho";

function moeda(valor: number): string {
  return `R$ ${Math.abs(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function data(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeBr(): string {
  return new Date().toLocaleDateString("pt-BR");
}

/**
 * A ordem no formato do formulário impresso, gerada como imagem.
 *
 * Toda rubrica aparece, mesmo sem valor — é o que faz a folha ser
 * reconhecível para quem já usa o papel. A diferença é que uma rubrica com
 * vários lançamentos rende várias linhas, em vez das linhas em branco de
 * reserva que existiam no papel para escrever à mão.
 */
export function OrdemImagem({ ordem, onVoltar }: { ordem: OrdemPagamento; onVoltar: () => void }) {
  const rubricas = useRubricas();
  const linhas = useLinhasOrdem(ordem.id);
  const container = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const dados = useMemo<DadosOrdemImagem | null>(() => {
    if (!rubricas.data || !linhas.data) return null;

    const montadas: LinhaImagem[] = [];
    for (const rubrica of rubricas.data) {
      const doGrupo = linhas.data.filter((l) => l.rubrica === rubrica.codigo);
      const cor: LinhaImagem["cor"] =
        rubrica.codigo === "adiantamento" ? "destaque" : rubrica.sinal < 0 ? "negativo" : "normal";

      if (doGrupo.length === 0) {
        montadas.push({
          rotulo: rubrica.rotulo.toUpperCase(),
          data: "",
          valor: "",
          observacao: "",
          cor,
        });
        continue;
      }
      for (const linha of doGrupo) {
        const observacao = [
          linha.codigo_contrato ? `Cod. ${linha.codigo_contrato}` : "",
          linha.observacao ?? "",
        ]
          .filter(Boolean)
          .join(" — ");
        montadas.push({
          rotulo: rubrica.rotulo.toUpperCase(),
          data: data(linha.data_referencia),
          valor: moeda(linha.valor_liquido),
          observacao,
          cor,
        });
      }
    }

    const conta = [
      ordem.banco_efetivo ? `${ordem.banco_efetivo} AG: ${ordem.agencia_efetiva ?? "—"}` : "",
      ordem.conta_efetiva ? `C.C: ${ordem.conta_efetiva}` : "",
      ordem.favorecido_efetivo ? `FAV: ${ordem.favorecido_efetivo.toUpperCase()}` : "",
    ]
      .filter(Boolean)
      .join("  ");

    return {
      supervisor: (ordem.supervisor_nome ?? "").toUpperCase(),
      data: ordem.data_pagamento ? data(ordem.data_pagamento) : hojeBr(),
      representante: `${ordem.representante_codigo} - ${ordem.representante_nome.toUpperCase()}`,
      linhas: montadas,
      contaRepresentante: conta || "CONTA NÃO CADASTRADA",
      totalRepresentante: moeda(ordem.total_liquido),
      contaSupervisor: (ordem.supervisor_nome ?? "").toUpperCase(),
      totalSupervisor: "",
    };
  }, [rubricas.data, linhas.data, ordem]);

  useEffect(() => {
    if (!dados || !container.current) return;
    try {
      const canvas = desenharOrdem(dados);
      canvas.style.width = "770px";
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      canvasRef.current = canvas;
      container.current.replaceChildren(canvas);
      setErro(null);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível gerar a imagem.");
    }
  }, [dados]);

  function baixar() {
    if (!canvasRef.current) return;
    const competencia = ordem.competencia.slice(0, 7);
    baixarPng(canvasRef.current, `ordem-${ordem.representante_codigo}-${competencia}.png`);
  }

  if (rubricas.isLoading || linhas.isLoading) return <LoadingState />;

  return (
    <div className="flex flex-col gap-[3px]">
      <Toolbar>
        <ClassicButton onClick={onVoltar}>← Voltar à ordem</ClassicButton>
        <ToolbarSeparator />
        <ClassicButton variant="primary" onClick={baixar}>
          Baixar imagem (PNG)
        </ClassicButton>
      </Toolbar>

      {erro ? <Alert tone="error" title={erro} /> : null}

      {!ordem.banco_efetivo ? (
        <Alert tone="warning" title="Conta bancária não cadastrada">
          O rodapé sai sem os dados da conta. Preencha o banco no cadastro do representante para a
          folha sair completa.
        </Alert>
      ) : null}

      <div className="overflow-auto bg-surface p-3" ref={container} />
    </div>
  );
}
