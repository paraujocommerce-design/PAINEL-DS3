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
  useContratosPeriodo,
  useMetasPrefeituras,
  useMovimentosPeriodo,
  useOportunidades,
  usePrefeituras,
  useResponsavelPrefeituras,
  type Contrato,
  type Oportunidade,
} from "./api";
import { derivarIndicadores } from "./indicadores";
import {
  ETAPAS,
  rotuloEspera,
  ROTULO_ETAPA,
  ROTULO_PRAZO,
  ROTULO_STATUS,
  formatarData,
  limitesDoPeriodo,
  periodoAtual,
  referenciaDoPeriodo,
  rotuloPeriodo,
  type Etapa,
} from "./dominio";
import {
  DialogCancelarContrato,
  DialogContato,
  DialogFechamento,
  DialogInteracao,
  DialogMetaPrefeitura,
  DialogMoverEtapa,
  DialogNovaOportunidade,
  DialogNovaPrefeitura,
  DialogPerda,
  DialogProximoPasso,
  DialogReabertura,
  DialogRenovacao,
} from "./formularios";
import { DialogHistoricoPrefeitura } from "./detalhe";

const COLUNAS: Column[] = [
  { key: "prefeitura", label: "Prefeitura" },
  { key: "etapa", label: "Etapa" },
  { key: "status", label: "Status" },
  { key: "proximo", label: "Próximo passo" },
  { key: "prazo", label: "Prazo" },
  { key: "espera", label: "Espera" },
  { key: "parado", label: "Dias parado", align: "right" },
  { key: "acoes", label: "" },
];

const COLUNAS_CONTRATOS: Column[] = [
  { key: "prefeitura", label: "Prefeitura" },
  { key: "tipo", label: "Tipo" },
  { key: "data", label: "Data" },
  { key: "acao", label: "" },
];

const FILTROS_STATUS = [
  { value: "aberta", label: "Abertas" },
  { value: "todas", label: "Todas" },
  { value: "ganha", label: "Ganhas" },
  { value: "perdida", label: "Perdidas" },
];

function numero(valor: number | null, casas = 1): string | undefined {
  if (valor === null) return undefined;
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Frente Prefeituras: funil de novas prefeituras, contratos e renovações. */
export function PrefeiturasModule() {
  const [periodo, setPeriodo] = useState(periodoAtual);
  const [statusFiltro, setStatusFiltro] = useState("aberta");
  const [etapaFiltro, setEtapaFiltro] = useState("todas");
  const [busca, setBusca] = useState("");

  const [dialogo, setDialogo] = useState<
    "prefeitura" | "oportunidade" | "renovacao" | "meta" | null
  >(null);
  const [mover, setMover] = useState<Oportunidade | null>(null);
  const [proximo, setProximo] = useState<Oportunidade | null>(null);
  const [fechamento, setFechamento] = useState<Oportunidade | null>(null);
  const [perda, setPerda] = useState<Oportunidade | null>(null);
  const [reabertura, setReabertura] = useState<Oportunidade | null>(null);
  const [interacao, setInteracao] = useState<Oportunidade | null>(null);
  const [contatoDe, setContatoDe] = useState<Oportunidade | null>(null);
  const [historico, setHistorico] = useState<Oportunidade | null>(null);
  const [cancelar, setCancelar] = useState<Contrato | null>(null);

  const intervalo = useMemo(() => limitesDoPeriodo(periodo), [periodo]);
  const referencia = useMemo(() => referenciaDoPeriodo(periodo), [periodo]);

  const responsavel = useResponsavelPrefeituras();
  const prefeituras = usePrefeituras();
  const oportunidades = useOportunidades();
  const contratos = useContratosPeriodo(periodo, intervalo);
  const movimentos = useMovimentosPeriodo(periodo, intervalo);
  const metas = useMetasPrefeituras(periodo, intervalo);

  const carregando =
    responsavel.isLoading ||
    prefeituras.isLoading ||
    oportunidades.isLoading ||
    contratos.isLoading ||
    movimentos.isLoading ||
    metas.isLoading;

  const erro =
    responsavel.error ??
    prefeituras.error ??
    oportunidades.error ??
    contratos.error ??
    movimentos.error ??
    metas.error;

  const indicadores = useMemo(
    () =>
      derivarIndicadores({
        oportunidades: oportunidades.data ?? [],
        contratos: contratos.data ?? [],
        movimentos: movimentos.data ?? [],
        metas: metas.data ?? [],
        referenciaISO: referencia,
        intervalo,
      }),
    [oportunidades.data, contratos.data, movimentos.data, metas.data, referencia, intervalo],
  );

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return indicadores.linhas
      .filter((linha) =>
        statusFiltro === "todas" ? true : linha.oportunidade.status === statusFiltro,
      )
      .filter((linha) =>
        etapaFiltro === "todas" ? true : linha.oportunidade.etapa_atual === etapaFiltro,
      )
      .filter((linha) =>
        termo ? linha.oportunidade.prefeitura_nome.toLowerCase().includes(termo) : true,
      )
      .sort((a, b) => {
        const prazoA = a.oportunidade.prazo ?? "9999-12-31";
        const prazoB = b.oportunidade.prazo ?? "9999-12-31";
        return (
          prazoA.localeCompare(prazoB) ||
          a.oportunidade.prefeitura_nome.localeCompare(b.oportunidade.prefeitura_nome)
        );
      });
  }, [indicadores.linhas, statusFiltro, etapaFiltro, busca]);

  const semOportunidades = indicadores.linhas.length === 0;

  return (
    <Window
      title="Prefeituras — Frente comercial"
      className="h-full"
      actions={
        <span className="text-xs">
          Período: {rotuloPeriodo(periodo)} · Referência: {formatarData(referencia)} · Responsável:{" "}
          {responsavel.data?.nome ?? "—"}
        </span>
      }
    >
      <Toolbar>
        <Field label="Período">
          <Input
            type="month"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value || periodoAtual())}
          />
        </Field>
        <Field label="Situação">
          <Select value={statusFiltro} onChange={(event) => setStatusFiltro(event.target.value)}>
            {FILTROS_STATUS.map((filtro) => (
              <option key={filtro.value} value={filtro.value}>
                {filtro.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Etapa">
          <Select value={etapaFiltro} onChange={(event) => setEtapaFiltro(event.target.value)}>
            <option value="todas">Todas</option>
            {ETAPAS.map((etapa) => (
              <option key={etapa} value={etapa}>
                {ROTULO_ETAPA[etapa]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Buscar">
          <Input
            value={busca}
            placeholder="Nome do município"
            onChange={(event) => setBusca(event.target.value)}
          />
        </Field>
        <ToolbarSeparator />
        <ClassicButton onClick={() => setDialogo("prefeitura")}>Nova prefeitura</ClassicButton>
        <ClassicButton onClick={() => setDialogo("oportunidade")} disabled={!responsavel.data}>
          Abrir oportunidade
        </ClassicButton>
        <ClassicButton onClick={() => setDialogo("renovacao")}>Renovação</ClassicButton>
        <ClassicButton onClick={() => setDialogo("meta")}>Meta</ClassicButton>
      </Toolbar>

      {erro ? (
        <div className="my-2">
          <Alert tone="error" title="Não foi possível carregar a frente Prefeituras.">
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
            <Panel title="Carteira em andamento">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Oportunidades abertas" value={indicadores.carteira.abertas} />
                <IndicatorSlot label="Prazo vencido" value={indicadores.carteira.vencidas} />
                <IndicatorSlot label="Vence hoje" value={indicadores.carteira.venceHoje} />
                <IndicatorSlot
                  label="Dias médios na etapa"
                  value={numero(indicadores.carteira.tempoMedioNaEtapa)}
                  note={
                    indicadores.carteira.tempoMedioNaEtapa === null
                      ? "Sem oportunidades abertas"
                      : undefined
                  }
                />
              </div>
            </Panel>

            <Panel title="Espera">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Interna (DS3)" value={indicadores.carteira.esperaInterna} />
                <IndicatorSlot
                  label="Externa (prefeitura)"
                  value={indicadores.carteira.esperaExterna}
                />
                <IndicatorSlot label="Sem prazo" value={indicadores.carteira.semPrazo} />
              </div>
            </Panel>

            <Panel title="Movimento no período">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Avanços" value={indicadores.periodo.avancos} />
                <IndicatorSlot label="Ganhas" value={indicadores.periodo.ganhas} />
                <IndicatorSlot label="Perdidas" value={indicadores.periodo.perdidas} />
                <IndicatorSlot label="Reaberturas" value={indicadores.periodo.reaberturas} />
                <IndicatorSlot
                  label="Conversão"
                  value={numero(indicadores.periodo.conversao)}
                  unit={indicadores.periodo.conversao === null ? undefined : "%"}
                  note={
                    indicadores.periodo.conversao === null
                      ? "Nenhuma oportunidade encerrada no período"
                      : "Ganhas ÷ encerradas"
                  }
                />
              </div>
            </Panel>

            <Panel title="Contratos no período">
              <div className="grid gap-[3px] sm:grid-cols-2">
                <IndicatorSlot label="Novas prefeituras" value={indicadores.contratos.novas} />
                <IndicatorSlot
                  label="Meta de novas"
                  value={numero(indicadores.contratos.metaNovas, 0)}
                  note={indicadores.contratos.metaNovas === null ? "Meta não definida" : undefined}
                />
                <IndicatorSlot label="Renovações" value={indicadores.contratos.renovacoes} />
                <IndicatorSlot
                  label="Meta de renovações"
                  value={numero(indicadores.contratos.metaRenovacoes, 0)}
                  note={
                    indicadores.contratos.metaRenovacoes === null ? "Meta não definida" : undefined
                  }
                />
                <IndicatorSlot
                  label="Atingimento — novas"
                  value={numero(indicadores.contratos.atingimentoNovas)}
                  unit={indicadores.contratos.atingimentoNovas === null ? undefined : "%"}
                  note={
                    indicadores.contratos.atingimentoNovas === null
                      ? "Meta não definida"
                      : undefined
                  }
                />
                <IndicatorSlot
                  label="Atingimento — renovações"
                  value={numero(indicadores.contratos.atingimentoRenovacoes)}
                  unit={indicadores.contratos.atingimentoRenovacoes === null ? undefined : "%"}
                  note={
                    indicadores.contratos.atingimentoRenovacoes === null
                      ? "Meta não definida"
                      : undefined
                  }
                />
              </div>
            </Panel>
          </div>

          <Panel title="Funil de novas prefeituras (oportunidades abertas)">
            <div className="grid gap-[3px] sm:grid-cols-3 xl:grid-cols-5">
              {indicadores.funil.map((item) => (
                <IndicatorSlot
                  key={item.etapa}
                  label={ROTULO_ETAPA[item.etapa]}
                  value={item.quantidade}
                />
              ))}
            </div>
          </Panel>

          {semOportunidades ? (
            <EmptyState
              title="Nenhuma oportunidade registrada."
              description="Cadastre a prefeitura e abra a oportunidade para iniciar o funil."
              action={
                <ClassicButton onClick={() => setDialogo("prefeitura")}>
                  Cadastrar prefeitura
                </ClassicButton>
              }
            />
          ) : linhasFiltradas.length === 0 ? (
            <EmptyState
              title="Nenhum resultado para os filtros aplicados."
              description="Ajuste situação, etapa ou busca."
            />
          ) : (
            <Table
              columns={COLUNAS}
              caption="Oportunidades de prefeituras"
              rows={linhasFiltradas.map((linha) => ({
                prefeitura: `${linha.oportunidade.prefeitura_nome} — ${linha.oportunidade.uf}`,
                etapa: ROTULO_ETAPA[linha.oportunidade.etapa_atual as Etapa],
                status: ROTULO_STATUS[linha.oportunidade.status],
                proximo: linha.oportunidade.proximo_passo ?? "—",
                prazo: (
                  <span className="flex flex-col">
                    <span>{formatarData(linha.oportunidade.prazo)}</span>
                    <span className="text-xs text-muted-foreground">
                      {ROTULO_PRAZO[linha.situacaoPrazo]}
                    </span>
                  </span>
                ),
                espera: rotuloEspera(linha.oportunidade.tipo_espera),

                parado: linha.diasParado === null ? "—" : linha.diasParado,
                acoes: (
                  <span className="flex flex-wrap gap-1">
                    <ClassicButton onClick={() => setHistorico(linha.oportunidade)}>
                      Histórico
                    </ClassicButton>
                    {linha.oportunidade.status === "aberta" ? (
                      <>
                        <ClassicButton onClick={() => setMover(linha.oportunidade)}>
                          Mover
                        </ClassicButton>
                        <ClassicButton onClick={() => setProximo(linha.oportunidade)}>
                          Próximo passo
                        </ClassicButton>
                        <ClassicButton onClick={() => setInteracao(linha.oportunidade)}>
                          Interação
                        </ClassicButton>
                        <ClassicButton onClick={() => setContatoDe(linha.oportunidade)}>
                          Contatos
                        </ClassicButton>
                        <ClassicButton onClick={() => setFechamento(linha.oportunidade)}>
                          Fechar
                        </ClassicButton>
                        <ClassicButton onClick={() => setPerda(linha.oportunidade)}>
                          Perda
                        </ClassicButton>
                      </>
                    ) : null}
                    {linha.oportunidade.status === "perdida" ? (
                      <ClassicButton onClick={() => setReabertura(linha.oportunidade)}>
                        Reabrir
                      </ClassicButton>
                    ) : null}
                  </span>
                ),
              }))}
            />
          )}

          <Panel title="Contratos válidos no período">
            <Table
              columns={COLUNAS_CONTRATOS}
              caption="Contratos do período"
              emptyMessage="Nenhum contrato registrado no período."
              rows={(contratos.data ?? []).map((contrato) => ({
                prefeitura: `${contrato.prefeitura_nome} — ${contrato.uf}`,
                tipo: contrato.tipo === "nova" ? "Contrato novo" : "Renovação",
                data: formatarData(contrato.data_contrato),
                acao: <ClassicButton onClick={() => setCancelar(contrato)}>Cancelar</ClassicButton>,
              }))}
            />
          </Panel>
        </div>
      )}

      <DialogNovaPrefeitura open={dialogo === "prefeitura"} onClose={() => setDialogo(null)} />
      <DialogNovaOportunidade
        open={dialogo === "oportunidade"}
        onClose={() => setDialogo(null)}
        prefeituras={prefeituras.data ?? []}
        responsavelNome={responsavel.data?.nome ?? "—"}
      />
      <DialogRenovacao
        open={dialogo === "renovacao"}
        onClose={() => setDialogo(null)}
        prefeituras={prefeituras.data ?? []}
      />

      <DialogMetaPrefeitura
        open={dialogo === "meta"}
        onClose={() => setDialogo(null)}
        periodo={periodo}
      />
      <DialogMoverEtapa oportunidade={mover} onClose={() => setMover(null)} />
      <DialogProximoPasso oportunidade={proximo} onClose={() => setProximo(null)} />
      <DialogFechamento oportunidade={fechamento} onClose={() => setFechamento(null)} />
      <DialogPerda oportunidade={perda} onClose={() => setPerda(null)} />
      <DialogReabertura oportunidade={reabertura} onClose={() => setReabertura(null)} />
      <DialogInteracao oportunidade={interacao} onClose={() => setInteracao(null)} />
      <DialogContato
        prefeituraId={contatoDe?.prefeitura_id ?? null}
        prefeituraNome={contatoDe?.prefeitura_nome ?? ""}
        onClose={() => setContatoDe(null)}
      />
      <DialogHistoricoPrefeitura
        oportunidade={historico}
        onClose={() => setHistorico(null)}
        onCancelarContrato={(contrato) => setCancelar(contrato)}
      />
      <DialogCancelarContrato contrato={cancelar} onClose={() => setCancelar(null)} />
    </Window>
  );
}
