import { useMemo, useState } from "react";
import {
  Window,
  Table,
  EmptyState,
  LoadingState,
  ClassicButton,
  Toolbar,
  ToolbarSeparator,
  Select,
  Input,
  Field,
  Panel,
  IndicatorSlot,
  Alert,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import {
  useCaptacaoPeriodo,
  useCarteiraAtual,
  useCarteiraReferencia,
  useMetasVigentes,
  useProducoesPeriodo,
  useReativacoesPeriodo,
  useExcluirRepresentante,
  useSupervisor,
} from "./api";
import { usePapelUsuario } from "@/lib/papel-usuario";
import { derivarIndicadores, type LinhaRepresentante } from "./indicadores";
import {
  ROTULO_STATUS,
  formatarData,
  limitesDoPeriodo,
  periodoAtual,
  referenciaDoPeriodo,
  rotuloPeriodo,
  type StatusAtividade,
} from "./dominio";
import {
  DialogEditarRepresentante,
  DialogMeta,
  DialogNovoRepresentante,
  DialogRegistrarProducao,
} from "./formularios";
import { DialogHistorico } from "./detalhe";

/**
 * Implementação ÚNICA da gestão de representantes.
 * Berg e Clênio são apenas contextos de supervisão desta mesma arquitetura.
 */
export type SupervisorContext = { slug: string; label: string };

const COLUNAS: Column[] = [
  { key: "representante", label: "Representante" },
  { key: "contratos", label: "Contratos no período", align: "right" },
  { key: "participacao", label: "Participação", align: "right" },
  { key: "status", label: "Status" },
  { key: "dias", label: "Dias sem venda", align: "right" },
  { key: "ultima", label: "Última produção" },
  { key: "acao", label: "" },
];

const FILTROS_STATUS: Array<{ value: string; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "atencao", label: "Atenção" },
  { value: "inativo", label: "Inativo" },
  { value: "sem_producao", label: "Sem produção" },
];

function numero(valor: number | null, sufixo = ""): string | undefined {
  if (valor === null) return undefined;
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${sufixo}`;
}

export function RepresentantesModule({ supervisor }: { supervisor: SupervisorContext }) {
  const [periodo, setPeriodo] = useState(periodoAtual);
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [dialogo, setDialogo] = useState<"representante" | "producao" | "meta" | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaRepresentante | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const { ehAdmin } = usePapelUsuario();
  const excluir = useExcluirRepresentante();

  async function excluirRepresentante(id: string, nome: string) {
    setErroExclusao(null);
    const confirmado = window.confirm(
      `Excluir em definitivo o representante ${nome}?\n\n` +
        "Os contratos, a produção e o histórico dele também serão apagados. " +
        "Esta ação não pode ser desfeita.",
    );
    if (!confirmado) return;
    try {
      await excluir.mutateAsync(id);
    } catch (causa) {
      setErroExclusao(
        causa instanceof Error ? causa.message : "Não foi possível excluir o representante.",
      );
    }
  }

  const intervalo = useMemo(() => limitesDoPeriodo(periodo), [periodo]);
  const referencia = useMemo(() => referenciaDoPeriodo(periodo), [periodo]);

  const contexto = useSupervisor(supervisor.slug);
  const supervisorId = contexto.data?.id;
  const carteira = useCarteiraReferencia(supervisor.slug, referencia, supervisorId);
  const carteiraAtual = useCarteiraAtual(supervisor.slug);
  const producoes = useProducoesPeriodo(supervisor.slug, periodo, intervalo, supervisorId);
  const reativacoes = useReativacoesPeriodo(supervisor.slug, periodo, intervalo, supervisorId);
  const captacoes = useCaptacaoPeriodo(supervisor.slug, periodo, intervalo, supervisorId);
  const metas = useMetasVigentes(supervisor.slug, periodo, intervalo, supervisorId);

  const carregando =
    contexto.isLoading ||
    carteira.isLoading ||
    producoes.isLoading ||
    reativacoes.isLoading ||
    captacoes.isLoading ||
    metas.isLoading;

  const erro =
    contexto.error ??
    carteira.error ??
    producoes.error ??
    reativacoes.error ??
    captacoes.error ??
    metas.error;

  const indicadores = useMemo(
    () =>
      derivarIndicadores({
        representantes: carteira.data ?? [],
        producoes: producoes.data ?? [],
        reativacoes: reativacoes.data ?? [],
        captacoes: captacoes.data ?? [],
        metas: metas.data ?? [],
        referenciaISO: referencia,
      }),
    [carteira.data, producoes.data, reativacoes.data, captacoes.data, metas.data, referencia],
  );

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return indicadores.linhas
      .filter((linha) => (statusFiltro === "todos" ? true : linha.status === statusFiltro))
      .filter((linha) => (termo ? linha.representante.nome.toLowerCase().includes(termo) : true))
      .sort(
        (a, b) =>
          b.contratosPeriodo - a.contratosPeriodo ||
          a.representante.nome.localeCompare(b.representante.nome),
      );
  }, [indicadores.linhas, statusFiltro, busca]);

  const semRepresentantes = indicadores.linhas.length === 0;

  return (
    <Window
      title={`Representantes — Supervisão ${supervisor.label}`}
      className="h-full"
      actions={
        <span className="text-xs">
          Período: {rotuloPeriodo(periodo)} · Referência: {formatarData(referencia)}
        </span>
      }
    >
      <Toolbar>
        <Field label="Supervisão">
          <Select value={supervisor.slug} disabled>
            <option value={supervisor.slug}>{supervisor.label}</option>
          </Select>
        </Field>
        <Field label="Período">
          <Input
            type="month"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value || periodoAtual())}
          />
        </Field>
        <Field label="Status">
          <Select value={statusFiltro} onChange={(event) => setStatusFiltro(event.target.value)}>
            {FILTROS_STATUS.map((filtro) => (
              <option key={filtro.value} value={filtro.value}>
                {filtro.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Buscar">
          <Input
            value={busca}
            placeholder="Nome do representante"
            onChange={(event) => setBusca(event.target.value)}
          />
        </Field>
        <ToolbarSeparator />
        <ClassicButton onClick={() => setDialogo("representante")} disabled={!supervisorId}>
          Novo representante
        </ClassicButton>
        <ClassicButton onClick={() => setDialogo("producao")} disabled={!supervisorId}>
          Registrar produção
        </ClassicButton>
        <ClassicButton onClick={() => setDialogo("meta")} disabled={!supervisorId}>
          Meta
        </ClassicButton>
      </Toolbar>

      {erroExclusao ? (
        <div className="my-2">
          <Alert tone="error" title={erroExclusao} />
        </div>
      ) : null}

      {erro ? (
        <div className="my-2">
          <Alert tone="error" title="Não foi possível carregar os dados desta supervisão.">
            {erro instanceof Error ? erro.message : null}
          </Alert>
        </div>
      ) : null}

      {carregando ? (
        <div className="mt-2">
          <LoadingState />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-[3px]">
          <div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
            <Panel title="Resultado — contratos Serasa">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Contratos no mês" value={indicadores.resultado.contratos} />
                <IndicatorSlot
                  label="Meta do mês"
                  value={numero(indicadores.resultado.meta)}
                  note={indicadores.resultado.meta === null ? "Meta não definida" : undefined}
                />
                <IndicatorSlot
                  label="Atingimento"
                  value={numero(indicadores.resultado.atingimento)}
                  unit={indicadores.resultado.atingimento === null ? undefined : "%"}
                  note={
                    indicadores.resultado.atingimento === null ? "Meta não definida" : undefined
                  }
                />
                <IndicatorSlot
                  label="Diferença para a meta"
                  value={numero(indicadores.resultado.diferenca)}
                  note={indicadores.resultado.diferenca === null ? "Meta não definida" : undefined}
                />
              </div>
            </Panel>

            <Panel title="Rede">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Vinculados" value={indicadores.rede.total} />
                <IndicatorSlot label="Ativos" value={indicadores.rede.ativos} />
                <IndicatorSlot label="Atenção" value={indicadores.rede.atencao} />
                <IndicatorSlot label="Inativos" value={indicadores.rede.inativos} />
                <IndicatorSlot label="Sem produção" value={indicadores.rede.semProducao} />
                <IndicatorSlot
                  label="Meta de ativos"
                  value={numero(indicadores.rede.metaAtivos)}
                  note={indicadores.rede.metaAtivos === null ? "Meta não definida" : undefined}
                />
              </div>
            </Panel>

            <Panel title="Captação">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot
                  label="Captados no período"
                  value={indicadores.rede.captadosNoPeriodo}
                  note="Captação não é contrato."
                />
                <IndicatorSlot
                  label="Primeira venda no período"
                  value={indicadores.producao.primeiraVendaNoPeriodo}
                />
                <IndicatorSlot
                  label="Reativações no período"
                  value={indicadores.rede.reativacoesNoPeriodo}
                />
              </div>
            </Panel>

            <Panel title="Produção">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot
                  label="Produziram"
                  value={indicadores.producao.representantesComProducao}
                />
                <IndicatorSlot label="Contratos totais" value={indicadores.producao.contratos} />
                <IndicatorSlot
                  label="Média por produtivo"
                  value={numero(indicadores.producao.media)}
                  note={
                    indicadores.producao.media === null
                      ? "Sem representantes com produção no período"
                      : undefined
                  }
                />
              </div>
            </Panel>
          </div>

          {semRepresentantes ? (
            <EmptyState
              title="Nenhum representante vinculado a esta supervisão."
              description="Cadastre um representante para começar a registrar produção."
              action={
                <ClassicButton onClick={() => setDialogo("representante")} disabled={!supervisorId}>
                  Cadastrar representante
                </ClassicButton>
              }
            />
          ) : linhasFiltradas.length === 0 ? (
            <EmptyState
              title="Nenhum resultado para os filtros aplicados."
              description="Ajuste o status ou a busca para ver os representantes desta supervisão."
            />
          ) : (
            <Table
              columns={COLUNAS}
              caption={`Representantes — ${supervisor.label}`}
              rows={linhasFiltradas.map((linha) => ({
                representante: (
                  <span className="flex items-center gap-2">
                    {linha.representante.nome}
                    {linha.reativadoNoPeriodo ? (
                      <span className="w2k-out px-1 text-xs">Reativado recentemente</span>
                    ) : null}
                  </span>
                ),
                contratos: linha.contratosPeriodo,
                participacao:
                  linha.participacao === null
                    ? "—"
                    : `${linha.participacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
                status: ROTULO_STATUS[linha.status as StatusAtividade],
                dias: linha.diasSemVenda === null ? "—" : linha.diasSemVenda,
                ultima: formatarData(linha.representante.ultima_producao),
                acao: (
                  <span className="flex gap-1">
                    <ClassicButton onClick={() => setEditando(linha.representante.id)}>
                      Editar
                    </ClassicButton>
                    <ClassicButton onClick={() => setDetalhe(linha)}>Histórico</ClassicButton>
                    {ehAdmin ? (
                      <ClassicButton
                        onClick={() =>
                          void excluirRepresentante(
                            linha.representante.id,
                            linha.representante.nome,
                          )
                        }
                        disabled={excluir.isPending}
                      >
                        Excluir
                      </ClassicButton>
                    ) : null}
                  </span>
                ),
              }))}
            />
          )}
        </div>
      )}

      <DialogNovoRepresentante
        open={dialogo === "representante"}
        onClose={() => setDialogo(null)}
        supervisorId={supervisorId}
        supervisorLabel={supervisor.label}
        possiveisLideres={carteiraAtual.data ?? []}
      />
      <DialogRegistrarProducao
        open={dialogo === "producao"}
        onClose={() => setDialogo(null)}
        representantes={carteiraAtual.data ?? []}
      />
      <DialogMeta
        open={dialogo === "meta"}
        onClose={() => setDialogo(null)}
        supervisorId={supervisorId}
        periodo={periodo}
      />
      <DialogEditarRepresentante
        representanteId={editando}
        onClose={() => setEditando(null)}
        possiveisLideres={carteiraAtual.data ?? []}
      />
      <DialogHistorico linha={detalhe} onClose={() => setDetalhe(null)} />
    </Window>
  );
}
