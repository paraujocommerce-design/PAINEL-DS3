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
  Dialog,
  Tabs,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import {
  useAcaoOrdem,
  useApurarCompetencia,
  useDebitos,
  useItensOrdem,
  useOrdensPagamento,
  type OrdemPagamento,
} from "./api";

const COLUNAS_ORDENS: Column[] = [
  { key: "representante", label: "Representante" },
  { key: "itens", label: "Itens", align: "right" },
  { key: "bruto", label: "Bruto", align: "right" },
  { key: "desconto", label: "Desconto", align: "right" },
  { key: "liquido", label: "A pagar", align: "right" },
  { key: "devedor", label: "Saldo devedor", align: "right" },
  { key: "status", label: "Situação" },
  { key: "acao", label: "" },
];

const COLUNAS_ITENS: Column[] = [
  { key: "tipo", label: "Tipo" },
  { key: "descricao", label: "Descrição" },
  { key: "bruto", label: "Bruto", align: "right" },
  { key: "desconto", label: "Desconto", align: "right" },
  { key: "liquido", label: "Líquido", align: "right" },
];

const COLUNAS_DEBITOS: Column[] = [
  { key: "representante", label: "Representante" },
  { key: "motivo", label: "Motivo" },
  { key: "data", label: "Desde" },
  { key: "original", label: "Original", align: "right" },
  { key: "abatido", label: "Abatido", align: "right" },
  { key: "saldo", label: "Saldo", align: "right" },
];

const ROTULO_TIPO: Record<string, string> = {
  premiacao_contrato: "Premiação",
  comissao_lideranca: "Liderança",
  meta_plus: "Meta Plus",
  incentivo_comercial: "Incentivo 10%",
  ajuste: "Ajuste",
};

const ROTULO_STATUS: Record<string, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  paga: "Paga",
  cancelada: "Cancelada",
};

function periodoAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Detalhe da ordem: todos os itens discriminados, como o gestor pediu. */
function DialogDetalheOrdem({
  ordem,
  onClose,
}: {
  ordem: OrdemPagamento | null;
  onClose: () => void;
}) {
  const itens = useItensOrdem(ordem?.id);

  return (
    <Dialog
      open={ordem !== null}
      title={
        ordem
          ? `Ordem de ${ordem.representante_codigo} — ${ordem.representante_nome}`
          : "Ordem de pagamento"
      }
      onClose={onClose}
      footer={<ClassicButton onClick={onClose}>Fechar</ClassicButton>}
    >
      {itens.isLoading ? (
        <LoadingState />
      ) : (itens.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum item nesta ordem."
          description="Apure a competência para gerar os itens."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Table
            columns={COLUNAS_ITENS}
            rows={(itens.data ?? []).map((item) => ({
              tipo: ROTULO_TIPO[item.tipo] ?? item.tipo,
              descricao: item.descricao,
              bruto: moeda(item.valor_bruto),
              desconto: item.desconto > 0 ? moeda(item.desconto) : "—",
              liquido: moeda(item.valor_liquido),
            }))}
          />
          {ordem ? (
            <p className="text-right text-sm">
              <strong>Total a pagar: {moeda(ordem.total_liquido)}</strong>
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

export function PagamentosModule() {
  const [competencia, setCompetencia] = useState(periodoAtual);
  const [aba, setAba] = useState("ordens");
  const [detalhe, setDetalhe] = useState<OrdemPagamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ordens = useOrdensPagamento(competencia);
  const debitos = useDebitos();
  const apurar = useApurarCompetencia();
  const acao = useAcaoOrdem();

  const totais = useMemo(() => {
    const lista = ordens.data ?? [];
    return {
      quantidade: lista.length,
      aPagar: lista
        .filter((o) => o.status !== "cancelada")
        .reduce((soma, o) => soma + o.total_liquido, 0),
      pagas: lista.filter((o) => o.status === "paga").length,
      abertas: lista.filter((o) => o.status === "aberta").length,
    };
  }, [ordens.data]);

  async function apurarAgora() {
    setErro(null);
    setAviso(null);
    try {
      const qtd = await apurar.mutateAsync(competencia);
      setAviso(
        qtd === 0
          ? "Nenhum representante com movimento nesta competência."
          : `${qtd} ordem(ns) apurada(s).`,
      );
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível apurar.");
    }
  }

  async function executar(ordem: OrdemPagamento, tipo: "fechar" | "pagar" | "cancelar") {
    setErro(null);
    setAviso(null);
    let motivo: string | undefined;
    if (tipo === "cancelar") {
      const informado = window.prompt("Motivo do cancelamento da ordem:");
      if (!informado?.trim()) return;
      motivo = informado.trim();
    } else if (tipo === "pagar") {
      const confirmado = window.confirm(
        `Marcar como paga a ordem de ${ordem.representante_nome} (${moeda(ordem.total_liquido)})?`,
      );
      if (!confirmado) return;
    }
    try {
      await acao.mutateAsync({ ordemId: ordem.id, acao: tipo, motivo });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível concluir a ação.");
    }
  }

  return (
    <Window title="Pagamentos — ordens e saldo devedor" className="h-full">
      <Toolbar>
        <Field label="Competência">
          <Input
            type="month"
            value={competencia}
            onChange={(event) => setCompetencia(event.target.value || periodoAtual())}
          />
        </Field>
        <ToolbarSeparator />
        <ClassicButton variant="primary" onClick={() => void apurarAgora()} disabled={apurar.isPending}>
          {apurar.isPending ? "Apurando..." : "Apurar competência"}
        </ClassicButton>
      </Toolbar>

      {erro ? (
        <div className="my-2">
          <Alert tone="error" title={erro} />
        </div>
      ) : null}
      {aviso ? (
        <div className="my-2">
          <Alert tone="info" title={aviso} />
        </div>
      ) : null}

      <div className="mt-2">
        <Tabs
          value={aba}
          onChange={setAba}
          items={[
            { value: "ordens", label: "Ordens de pagamento" },
            { value: "debitos", label: "Saldo devedor" },
          ]}
        />
      </div>

      {aba === "ordens" ? (
        ordens.isLoading ? (
          <div className="mt-2">
            <LoadingState />
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-[3px]">
            <Panel title="Resumo da competência">
              <div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
                <IndicatorSlot label="Ordens" value={totais.quantidade} />
                <IndicatorSlot
                  label="Total a pagar"
                  value={totais.quantidade === 0 ? undefined : moeda(totais.aPagar)}
                  note={totais.quantidade === 0 ? "Nada apurado nesta competência" : undefined}
                />
                <IndicatorSlot label="Abertas" value={totais.abertas} />
                <IndicatorSlot label="Pagas" value={totais.pagas} />
              </div>
            </Panel>

            {(ordens.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhuma ordem nesta competência."
                description="Use 'Apurar competência' para gerar as ordens a partir dos contratos lançados."
              />
            ) : (
              <Table
                columns={COLUNAS_ORDENS}
                caption={`Ordens — ${competencia}`}
                rows={(ordens.data ?? []).map((ordem) => ({
                  representante: `${ordem.representante_codigo} — ${ordem.representante_nome}`,
                  itens: ordem.itens,
                  bruto: moeda(ordem.total_bruto),
                  desconto: ordem.total_desconto > 0 ? moeda(ordem.total_desconto) : "—",
                  liquido: moeda(ordem.total_liquido),
                  devedor:
                    ordem.saldo_devedor_atual > 0 ? moeda(ordem.saldo_devedor_atual) : "—",
                  status: ROTULO_STATUS[ordem.status] ?? ordem.status,
                  acao: (
                    <span className="flex gap-1">
                      <ClassicButton onClick={() => setDetalhe(ordem)}>Detalhe</ClassicButton>
                      {ordem.status === "aberta" ? (
                        <ClassicButton onClick={() => void executar(ordem, "fechar")}>
                          Fechar
                        </ClassicButton>
                      ) : null}
                      {ordem.status === "aberta" || ordem.status === "fechada" ? (
                        <>
                          <ClassicButton onClick={() => void executar(ordem, "pagar")}>
                            Pagar
                          </ClassicButton>
                          <ClassicButton onClick={() => void executar(ordem, "cancelar")}>
                            Cancelar
                          </ClassicButton>
                        </>
                      ) : null}
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )
      ) : debitos.isLoading ? (
        <div className="mt-2">
          <LoadingState />
        </div>
      ) : (debitos.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum débito em aberto."
          description="Débitos registrados aparecem aqui até serem totalmente abatidos."
        />
      ) : (
        <div className="mt-2">
          <Table
            columns={COLUNAS_DEBITOS}
            caption="Débitos em aberto"
            rows={(debitos.data ?? []).map((debito) => ({
              representante: `${debito.representante_codigo} — ${debito.representante_nome}`,
              motivo: debito.motivo,
              data: formatarData(debito.data_origem),
              original: moeda(debito.valor_original),
              abatido: debito.valor_abatido > 0 ? moeda(debito.valor_abatido) : "—",
              saldo: moeda(debito.saldo),
            }))}
          />
        </div>
      )}

      <DialogDetalheOrdem ordem={detalhe} onClose={() => setDetalhe(null)} />
    </Window>
  );
}
