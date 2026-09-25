import { useMemo, useState } from "react";
import {
  Window,
  Table,
  EmptyState,
  LoadingState,
  ClassicButton,
  Toolbar,
  ToolbarSeparator,
  Input,
  Field,
  Panel,
  IndicatorSlot,
  Alert,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import {
  useContratosIncompletos,
  useContratosLancados,
  useExcluirContrato,
} from "./api";
import { usePapelUsuario } from "@/lib/papel-usuario";
import { moeda, formatarData, periodoAtual, limitesDoPeriodo } from "@/lib/formatacao";
import { DialogNovoContrato } from "./formularios";
import { DialogGerarContrato } from "./gerar-contrato";

const COLUNAS: Column[] = [
  { key: "data", label: "Data" },
  { key: "contrato", label: "Contrato" },
  { key: "cliente", label: "Cliente" },
  { key: "representante", label: "Representante" },
  { key: "plano", label: "Plano", align: "right" },
  { key: "premiacao", label: "Premiação", align: "right" },
  { key: "lider", label: "Liderança" },
  { key: "situacao", label: "Situação" },
  { key: "acao", label: "" },
];

export function ContratosModule() {
  const [periodo, setPeriodo] = useState(periodoAtual);
  const [busca, setBusca] = useState("");
  const [abrindoDialogo, setAbrindoDialogo] = useState(false);
  const [abrindoDialogoGerar, setAbrindoDialogoGerar] = useState(false);

  const intervalo = useMemo(() => limitesDoPeriodo(periodo), [periodo]);
  const contratos = useContratosLancados(intervalo, periodo);
  const incompletos = useContratosIncompletos();
  const { ehAdmin } = usePapelUsuario();
  const excluir = useExcluirContrato();
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  async function excluirContrato(id: string, descricao: string) {
    setErroExclusao(null);
    const confirmado = window.confirm(
      `Excluir em definitivo o contrato ${descricao}?\n\n` +
        "Esta ação não pode ser desfeita. Fica registrado quem excluiu e quando.",
    );
    if (!confirmado) return;
    try {
      await excluir.mutateAsync(id);
    } catch (causa) {
      setErroExclusao(
        causa instanceof Error ? causa.message : "Não foi possível excluir o contrato.",
      );
    }
  }

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contratos.data ?? [];
    return (contratos.data ?? []).filter(
      (contrato) =>
        contrato.codigo_contrato.toLowerCase().includes(termo) ||
        (contrato.nome_fantasia ?? "").toLowerCase().includes(termo) ||
        contrato.representante_nome.toLowerCase().includes(termo),
    );
  }, [contratos.data, busca]);

  // Totais do período — soma dos valores já calculados pelo banco.
  const totais = useMemo(() => {
    const lista = contratos.data ?? [];
    return {
      quantidade: lista.length,
      premiacao: lista.reduce((soma, c) => soma + c.premiacao_liquida, 0),
      lideranca: lista.reduce((soma, c) => soma + c.comissao_lideranca_liquida, 0),
      carteira: lista.reduce((soma, c) => soma + (c.valor_plano ?? 0), 0),
      semPlano: lista.filter((c) => c.valor_plano === null).length,
    };
  }, [contratos.data]);

  return (
    <Window title="Contratos — lançamento e acompanhamento" className="h-full">
      <Toolbar>
        <Field label="Período">
          <Input
            type="month"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value || periodoAtual())}
          />
        </Field>
        <Field label="Buscar">
          <Input
            value={busca}
            placeholder="Contrato, cliente ou representante"
            onChange={(event) => setBusca(event.target.value)}
          />
        </Field>
        <ToolbarSeparator />
        <ClassicButton variant="primary" onClick={() => setAbrindoDialogo(true)}>
          Lançar contrato
        </ClassicButton>
        <ClassicButton variant="default" onClick={() => setAbrindoDialogoGerar(true)}>
          Gerar contrato
        </ClassicButton>
      </Toolbar>

      {erroExclusao ? (
        <div className="my-2">
          <Alert tone="error" title={erroExclusao} />
        </div>
      ) : null}

      {contratos.error ? (
        <div className="my-2">
          <Alert tone="error" title="Não foi possível carregar os contratos.">
            {contratos.error instanceof Error ? contratos.error.message : null}
          </Alert>
        </div>
      ) : null}

      {(incompletos.data ?? 0) > 0 ? (
        <div className="my-2">
          <Alert
            tone="warning"
            title={`${incompletos.data} contrato(s) com dado faltando (CNPJ, cliente ou valor do plano).`}
          >
            Contratos sem valor do plano não entram na base do incentivo de 10%.
          </Alert>
        </div>
      ) : null}

      {contratos.isLoading ? (
        <div className="mt-2">
          <LoadingState />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-[3px]">
          <Panel title="Resultado do período">
            <div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
              <IndicatorSlot label="Contratos lançados" value={totais.quantidade} />
              <IndicatorSlot
                label="Premiação a pagar"
                value={totais.quantidade === 0 ? undefined : moeda(totais.premiacao)}
                note={totais.quantidade === 0 ? "Nenhum contrato no período" : undefined}
              />
              <IndicatorSlot
                label="Comissão de liderança"
                value={totais.quantidade === 0 ? undefined : moeda(totais.lideranca)}
                note={totais.quantidade === 0 ? "Nenhum contrato no período" : undefined}
              />
              <IndicatorSlot
                label="Carteira contratada no mês"
                value={totais.carteira === 0 ? undefined : moeda(totais.carteira)}
                note={
                  totais.semPlano > 0
                    ? `${totais.semPlano} contrato(s) sem valor do plano`
                    : undefined
                }
              />
            </div>
          </Panel>

          {linhas.length === 0 ? (
            <EmptyState
              title="Nenhum contrato lançado neste período."
              description="Use o botão 'Lançar contrato' para registrar as vendas conforme forem fechando."
            />
          ) : (
            <Table
              columns={COLUNAS}
              caption={`Contratos — ${periodo}`}
              rows={linhas.map((contrato) => ({
                data: formatarData(contrato.data_venda),
                contrato: contrato.codigo_contrato,
                cliente: contrato.nome_fantasia ?? "—",
                representante: `${contrato.representante_codigo} — ${contrato.representante_nome}`,
                plano: moeda(contrato.valor_plano),
                premiacao: contrato.premiavel ? moeda(contrato.premiacao_liquida) : "não premiável",
                lider: contrato.lider_nome
                  ? `${contrato.lider_nome} · ${moeda(contrato.comissao_lideranca_liquida)}`
                  : "—",
                situacao: (
                  <span className="flex flex-col gap-1">
                    {contrato.status_pos_venda ? <span>{contrato.status_pos_venda}</span> : null}
                    {contrato.possui_pendencia ? (
                      <span className="w2k-out px-1 text-xs">Pendência</span>
                    ) : null}
                    {contrato.cnpj === null ? (
                      <span className="w2k-out px-1 text-xs">Sem CNPJ</span>
                    ) : null}
                  </span>
                ),
                acao: ehAdmin ? (
                  <ClassicButton
                    onClick={() =>
                      void excluirContrato(
                        contrato.id,
                        `${contrato.codigo_contrato} — ${contrato.nome_fantasia ?? "sem cliente"}`,
                      )
                    }
                    disabled={excluir.isPending}
                  >
                    Excluir
                  </ClassicButton>
                ) : null,
              }))}
            />
          )}
        </div>
      )}

      <DialogNovoContrato open={abrindoDialogo} onClose={() => setAbrindoDialogo(false)} />
      <DialogGerarContrato open={abrindoDialogoGerar} onClose={() => setAbrindoDialogoGerar(false)} />
    </Window>
  );
}
