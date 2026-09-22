import { useState } from "react";
import {
  ClassicButton,
  EmptyState,
  LoadingState,
  Panel,
  Toolbar,
  Window,
} from "@/components/w2k";
import { usePapelUsuario } from "@/lib/papel-usuario";
import {
  useAutorizacoesPendentes,
  useOrdensProntasParaPagar,
  useOrdensAbertasOperacao,
} from "./api";
import type { OrdemPagamento } from "./api";
import { SlidePanelDetalheOrdem } from "./slide-panel-detalhe-ordem";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

interface AcaoItem {
  id: string;
  representante_codigo: string;
  representante_nome: string;
  data_ordem: string;
  total_valor: number;
  status: string;
  ordem: OrdemPagamento;
}

export function DashboardAcoes({
  onAbrirOrdem,
}: {
  onAbrirOrdem: (ordemId: string) => void;
}) {
  const papel = usePapelUsuario();
  const autPendentes = useAutorizacoesPendentes();
  const ordensParaPagar = useOrdensProntasParaPagar();
  const ordensAbertas = useOrdensAbertasOperacao();

  const [panelAberto, setPanelAberto] = useState(false);
  const [ordemSelecionada, setOrdemSelecionada] = useState<OrdemPagamento | null>(
    null
  );

  if (!papel || papel.carregando) return <LoadingState />;

  // Mapear dados para formato uniforme
  let acoes: AcaoItem[] = [];
  let titulo = "";
  let descricao = "";

  if (papel.ehSupervisao && autPendentes.data) {
    titulo = `${autPendentes.data.length} autorização(ões) esperando`;
    descricao = "Ordens fechadas que precisam de sua autorização";
    acoes = autPendentes.data.map((a) => ({
      id: a.ordem_id,
      representante_codigo: a.representante_codigo,
      representante_nome: a.representante_nome,
      data_ordem: a.data_ordem,
      total_valor: a.total_valor,
      status: "aguardando autorização",
      ordem: a as any,
    }));
  } else if (papel.ehAdmin && ordensParaPagar.data) {
    titulo = `${ordensParaPagar.data.filter((o) => o.pode_pagar).length} ordem(ns) pronta(s)`;
    descricao = "Ordens com todas as autorizações, prontas para pagar";
    acoes = ordensParaPagar.data
      .filter((o) => o.pode_pagar)
      .map((o) => ({
        id: o.id,
        representante_codigo: o.representante_codigo,
        representante_nome: o.representante_nome,
        data_ordem: o.data_ordem,
        total_valor: o.total_valor,
        status: "pronta para pagamento",
        ordem: o as any,
      }));
  } else if (papel.ehOperacao && ordensAbertas.data) {
    titulo = `${ordensAbertas.data.length} ordem(ns) em andamento`;
    descricao = "Ordens abertas que você está montando";
    acoes = ordensAbertas.data.map((o) => ({
      id: o.id,
      representante_codigo: o.representante_codigo,
      representante_nome: o.representante_nome,
      data_ordem: o.data_ordem,
      total_valor: o.total_valor,
      status: `${o.autorizacoes_pendentes}/${o.autorizacoes_exigidas} autorizações pendentes`,
      ordem: o as any,
    }));
  }

  // Ordenar por antigüidade (mais antigo primeiro)
  acoes.sort(
    (a, b) =>
      new Date(a.data_ordem).getTime() - new Date(b.data_ordem).getTime()
  );

  const handleAbrirPainel = (ordem: OrdemPagamento) => {
    setOrdemSelecionada(ordem);
    setPanelAberto(true);
  };

  const loading =
    autPendentes.isLoading || ordensParaPagar.isLoading || ordensAbertas.isLoading;

  return (
    <>
      <Window title="Central de Ações" className="h-full">
        <Toolbar>
          <h2 className="text-sm font-bold">{titulo}</h2>
        </Toolbar>

        <Panel>
          {loading ? (
            <LoadingState />
          ) : acoes.length === 0 ? (
            <EmptyState
              title="Nenhuma ação pendente"
              description={descricao}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-4">{descricao}</p>
              <div className="space-y-2">
                {acoes.map((acao) => (
                  <div
                    key={acao.id}
                    className="border rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">
                          {acao.representante_codigo} — {acao.representante_nome}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatarData(acao.data_ordem)} • {acao.status}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-base">
                          {moeda(acao.total_valor)}
                        </div>
                        <div className="flex gap-1 mt-2">
                          <ClassicButton
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (papel.ehSupervisao) {
                                onAbrirOrdem(acao.id);
                              } else if (papel.ehAdmin) {
                                onAbrirOrdem(acao.id);
                              } else {
                                handleAbrirPainel(acao.ordem);
                              }
                            }}
                          >
                            {papel.ehSupervisao
                              ? "Autorizar"
                              : papel.ehAdmin
                                ? "Pagar"
                                : "Editar"}
                          </ClassicButton>
                          <ClassicButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAbrirPainel(acao.ordem);
                            }}
                          >
                            Revisar
                          </ClassicButton>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </Window>

      <SlidePanelDetalheOrdem
        isOpen={panelAberto}
        onClose={() => setPanelAberto(false)}
        ordem={ordemSelecionada}
        onRefresh={() => {
          autPendentes.refetch();
          ordensParaPagar.refetch();
          ordensAbertas.refetch();
        }}
      />
    </>
  );
}
