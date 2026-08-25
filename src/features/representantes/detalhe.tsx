import { useState } from "react";
import {
  Dialog,
  ClassicButton,
  Panel,
  Table,
  LoadingState,
  Alert,
  Input,
  Field,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import { useCancelarProducao, useHistorico } from "./api";
import type { LinhaRepresentante } from "./indicadores";
import { ROTULO_STATUS, formatarData } from "./dominio";

const COLUNAS_PRODUCAO: Column[] = [
  { key: "data", label: "Data" },
  { key: "quantidade", label: "Contratos", align: "right" },
  { key: "origem", label: "Origem" },
  { key: "situacao", label: "Situação" },
  { key: "acao", label: "" },
];

const COLUNAS_EVENTO: Column[] = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Evento" },
  { key: "detalhe", label: "Detalhe" },
];

const ROTULO_EVENTO: Record<string, string> = {
  cadastro: "Cadastro",
  mudanca_supervisor: "Mudança de supervisor",
};

export function DialogHistorico({
  linha,
  onClose,
}: {
  linha: LinhaRepresentante | null;
  onClose: () => void;
}) {
  const historico = useHistorico(linha?.representante.id ?? null);
  const cancelar = useCancelarProducao();
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!linha) return null;
  const { representante, status, diasSemVenda } = linha;

  async function confirmarCancelamento(producaoId: string) {
    setErro(null);
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    try {
      await cancelar.mutateAsync({ producaoId, motivo });
      setCancelando(null);
      setMotivo("");
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cancelar.");
    }
  }

  return (
    <Dialog
      open
      title={`Representante — ${representante.nome}`}
      onClose={onClose}
      footer={<ClassicButton onClick={onClose}>Fechar</ClassicButton>}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
        <Panel title="Situação atual">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Supervisor atual</dt>
            <dd>{representante.supervisor_nome}</dd>
            <dt className="text-muted-foreground">Data de cadastro</dt>
            <dd>{formatarData(representante.data_cadastro)}</dd>
            <dt className="text-muted-foreground">Status calculado</dt>
            <dd>{ROTULO_STATUS[status]}</dd>
            <dt className="text-muted-foreground">Última venda</dt>
            <dd>{formatarData(representante.ultima_producao)}</dd>
            <dt className="text-muted-foreground">Dias sem venda</dt>
            <dd>{diasSemVenda === null ? "Sem produção registrada" : diasSemVenda}</dd>
            <dt className="text-muted-foreground">Contratos até a referência</dt>
            <dd>
              {representante.contratos_ate_referencia === null
                ? "Sem produção registrada"
                : representante.contratos_ate_referencia}
            </dd>
          </dl>
        </Panel>

        {erro ? <Alert tone="error" title={erro} /> : null}

        {historico.isLoading ? <LoadingState /> : null}
        {historico.isError ? (
          <Alert tone="error" title="Não foi possível carregar o histórico.">
            {historico.error instanceof Error ? historico.error.message : null}
          </Alert>
        ) : null}

        {historico.data ? (
          <>
            <Panel title="Produção registrada">
              <Table
                columns={COLUNAS_PRODUCAO}
                caption="Histórico de produção"
                emptyMessage="Nenhuma produção registrada."
                rows={historico.data.producoes.map((producao) => ({
                  data: formatarData(producao.data_producao),
                  quantidade: producao.quantidade,
                  origem:
                    producao.origem === "registro_manual" ? "Registro manual" : producao.origem,
                  situacao: producao.cancelada_em
                    ? `Cancelada — ${producao.motivo_cancelamento ?? ""}`
                    : "Válida",
                  acao: producao.cancelada_em ? null : cancelando === producao.id ? (
                    <span className="flex items-center gap-1">
                      <Field label="">
                        <Input
                          value={motivo}
                          placeholder="Motivo"
                          onChange={(event) => setMotivo(event.target.value)}
                        />
                      </Field>
                      <ClassicButton
                        disabled={cancelar.isPending}
                        onClick={() => void confirmarCancelamento(producao.id)}
                      >
                        Confirmar
                      </ClassicButton>
                    </span>
                  ) : (
                    <ClassicButton onClick={() => setCancelando(producao.id)}>
                      Cancelar
                    </ClassicButton>
                  ),
                }))}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Produção não é apagada: o cancelamento preserva o registro e o motivo.
              </p>
            </Panel>

            <Panel title="Eventos">
              <Table
                columns={COLUNAS_EVENTO}
                caption="Eventos do representante"
                emptyMessage="Nenhum evento registrado."
                rows={[
                  ...historico.data.eventos.map((evento) => ({
                    data: formatarData(evento.ocorrido_em),
                    tipo: ROTULO_EVENTO[evento.tipo] ?? evento.tipo,
                    detalhe: evento.detalhe ?? "—",
                    ordem: evento.ocorrido_em,
                  })),
                  // Reativação é derivada da sequência de produções válidas.
                  ...historico.data.reativacoes.map((reativacao) => ({
                    data: formatarData(reativacao.ocorrido_em),
                    tipo: "Reativação (derivada)",
                    detalhe: `${reativacao.dias_sem_producao} dias após ${formatarData(
                      reativacao.producao_anterior,
                    )}`,
                    ordem: reativacao.ocorrido_em,
                  })),
                ]
                  .sort((a, b) => (a.ordem < b.ordem ? 1 : -1))
                  .map(({ ordem: _ordem, ...linha }) => linha)}
              />
            </Panel>

            <Panel title="Histórico de supervisão">
              <Table
                columns={[
                  { key: "supervisor", label: "Supervisor" },
                  { key: "inicio", label: "Início" },
                  { key: "fim", label: "Fim" },
                ]}
                caption="Vínculos de supervisão"
                emptyMessage="Nenhum vínculo registrado."
                rows={historico.data.vinculos.map((vinculo) => ({
                  supervisor: vinculo.supervisor_nome,
                  inicio: formatarData(vinculo.inicio),
                  fim: vinculo.fim ? formatarData(vinculo.fim) : "Atual",
                }))}
              />
            </Panel>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
