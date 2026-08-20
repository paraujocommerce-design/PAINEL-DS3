import { Dialog, Table, Panel, LoadingState, Alert, ClassicButton } from "@/components/w2k";
import type { Column } from "@/components/w2k";
import { useDetalheOportunidade, type Contrato, type Oportunidade } from "./api";
import {
  ROTULO_ETAPA,
  ROTULO_MOVIMENTO,
  ROTULO_STATUS,
  TIPOS_INTERACAO,
  formatarData,
  rotuloEspera,
  type Etapa,
} from "./dominio";

const COLUNAS_MOVIMENTO: Column[] = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Movimento" },
  { key: "etapa", label: "Etapa" },
  { key: "motivo", label: "Motivo" },
  { key: "proximo", label: "Próximo passo definido" },
  { key: "situacao", label: "Situação / dependência" },
];

const COLUNAS_INTERACAO: Column[] = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Tipo" },
  { key: "descricao", label: "Descrição" },
];

const COLUNAS_CONTATO: Column[] = [
  { key: "nome", label: "Nome" },
  { key: "funcao", label: "Função" },
  { key: "decisor", label: "Decisor" },
  { key: "contato", label: "Contato" },
];

const COLUNAS_CONTRATO: Column[] = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Tipo" },
  { key: "observacao", label: "Observação" },
  { key: "acao", label: "" },
];

function rotuloInteracao(tipo: string): string {
  return TIPOS_INTERACAO.find((item) => item.value === tipo)?.label ?? tipo;
}

/** Histórico completo da oportunidade: movimentos, interações, decisores e contratos. */
export function DialogHistoricoPrefeitura({
  oportunidade,
  onClose,
  onCancelarContrato,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
  onCancelarContrato: (contrato: Contrato) => void;
}) {
  const detalhe = useDetalheOportunidade(oportunidade);

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Histórico — ${oportunidade?.prefeitura_nome ?? ""} (${oportunidade?.uf ?? ""})`}
      onClose={onClose}
      footer={<ClassicButton onClick={onClose}>Fechar</ClassicButton>}
    >
      {oportunidade ? (
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
          <Panel title="Situação atual">
            <div className="grid gap-1 text-xs sm:grid-cols-2">
              <p>Etapa: {ROTULO_ETAPA[oportunidade.etapa_atual as Etapa]}</p>
              <p>Status: {ROTULO_STATUS[oportunidade.status]}</p>
              <p>Responsável: {oportunidade.responsavel_nome}</p>
              <p>Entrada no funil: {formatarData(oportunidade.data_entrada)}</p>
              <p>Última movimentação: {formatarData(oportunidade.ultima_movimentacao)}</p>
              <p>Nesta etapa desde: {formatarData(oportunidade.etapa_desde)}</p>
              <p>Próximo passo: {oportunidade.proximo_passo ?? "—"}</p>
              <p>Prazo: {formatarData(oportunidade.prazo)}</p>
              <p>Situação: {rotuloEspera(oportunidade.tipo_espera)}</p>
              {oportunidade.tipo_espera === "externa" ? (
                <p>Dependência externa: {oportunidade.dependencia_externa ?? "—"}</p>
              ) : null}

              {oportunidade.motivo_perda ? (
                <p>Motivo da perda: {oportunidade.motivo_perda}</p>
              ) : null}
            </div>
          </Panel>

          {detalhe.error ? (
            <Alert tone="error" title="Não foi possível carregar o histórico.">
              {detalhe.error instanceof Error ? detalhe.error.message : null}
            </Alert>
          ) : null}

          {detalhe.isLoading ? (
            <LoadingState />
          ) : (
            <>
              <Panel title="Movimentações do funil">
                <Table
                  columns={COLUNAS_MOVIMENTO}
                  caption="Movimentações"
                  emptyMessage="Nenhuma movimentação registrada."
                  rows={(detalhe.data?.movimentos ?? []).map((movimento) => ({
                    data: formatarData(movimento.ocorrido_em),
                    tipo: ROTULO_MOVIMENTO[movimento.tipo] ?? movimento.tipo,
                    etapa: movimento.etapa_anterior
                      ? `${ROTULO_ETAPA[movimento.etapa_anterior as Etapa]} → ${ROTULO_ETAPA[movimento.etapa_nova as Etapa]}`
                      : ROTULO_ETAPA[movimento.etapa_nova as Etapa],
                    motivo: movimento.motivo ?? "—",
                    proximo: movimento.proximo_passo ?? "—",
                    situacao:
                      movimento.tipo_espera === "externa"
                        ? `${rotuloEspera("externa")} — ${movimento.dependencia_externa ?? "—"}`
                        : rotuloEspera(
                            (movimento.tipo_espera as "interna" | "externa" | null) ?? null,
                          ),
                  }))}
                />
              </Panel>

              <Panel title="Interações relevantes">
                <Table
                  columns={COLUNAS_INTERACAO}
                  caption="Interações"
                  emptyMessage="Nenhuma interação registrada."
                  rows={(detalhe.data?.interacoes ?? []).map((interacao) => ({
                    data: formatarData(interacao.ocorrido_em),
                    tipo: rotuloInteracao(interacao.tipo),
                    descricao: interacao.descricao,
                  }))}
                />
              </Panel>

              <Panel title="Contatos e decisores">
                <Table
                  columns={COLUNAS_CONTATO}
                  caption="Contatos"
                  emptyMessage="Nenhum contato registrado."
                  rows={(detalhe.data?.contatos ?? []).map((contato) => ({
                    nome: contato.nome,
                    funcao: contato.funcao ?? "—",
                    decisor: contato.decisor ? "Sim" : "Não",
                    contato: contato.contato ?? "—",
                  }))}
                />
              </Panel>

              <Panel title="Contratos válidos da prefeitura">
                <Table
                  columns={COLUNAS_CONTRATO}
                  caption="Contratos"
                  emptyMessage="Nenhum contrato válido registrado."
                  rows={(detalhe.data?.contratos ?? []).map((contrato) => ({
                    data: formatarData(contrato.data_contrato),
                    tipo: contrato.tipo === "nova" ? "Contrato novo" : "Renovação",
                    observacao: contrato.observacao ?? "—",
                    acao: (
                      <ClassicButton onClick={() => onCancelarContrato(contrato)}>
                        Cancelar
                      </ClassicButton>
                    ),
                  }))}
                />
              </Panel>
            </>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
