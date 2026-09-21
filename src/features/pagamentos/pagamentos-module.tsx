import { useMemo, useState } from "react";
import {
  Alert,
  ClassicButton,
  EmptyState,
  Field,
  IndicatorSlot,
  Input,
  LoadingState,
  Panel,
  Table,
  Tabs,
  Toolbar,
  ToolbarSeparator,
  Window,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import { useApurarCompetencia, useDebitos, useOrdensPagamento, type OrdemPagamento } from "./api";
import { OrdemDetalhe } from "./ordem-detalhe";

const COLUNAS_ORDENS: Column[] = [
  { key: "representante", label: "Representante" },
  { key: "supervisor", label: "Supervisor" },
  { key: "itens", label: "Linhas", align: "right" },
  { key: "liquido", label: "A pagar", align: "right" },
  { key: "devedor", label: "Saldo devedor", align: "right" },
  { key: "autorizacoes", label: "Autorizações" },
  { key: "status", label: "Situação" },
  { key: "acao", label: "" },
];

const COLUNAS_DEBITOS: Column[] = [
  { key: "representante", label: "Representante" },
  { key: "motivo", label: "Motivo" },
  { key: "data", label: "Desde" },
  { key: "original", label: "Original", align: "right" },
  { key: "abatido", label: "Abatido", align: "right" },
  { key: "saldo", label: "Saldo", align: "right" },
];

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
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Resumo do estado das autorizações, em uma frase curta. */
function resumoAutorizacoes(ordem: OrdemPagamento): string {
  if (ordem.autorizacoes_recusadas > 0) return "Recusada";
  if (ordem.autorizacoes_exigidas === 0) return "Não exigida";
  return `${ordem.autorizacoes_concedidas} de ${ordem.autorizacoes_exigidas}`;
}

export function PagamentosModule() {
  const [competencia, setCompetencia] = useState(periodoAtual);
  const [aba, setAba] = useState("ordens");
  const [ordemAbertaId, setOrdemAbertaId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ordens = useOrdensPagamento(competencia);
  const debitos = useDebitos();
  const apurar = useApurarCompetencia();

  // A ordem aberta vem sempre da lista recarregada, para a tela refletir
  // o estado de agora e não uma cópia congelada no clique.
  const ordemAberta = useMemo(
    () => (ordens.data ?? []).find((o) => o.id === ordemAbertaId) ?? null,
    [ordens.data, ordemAbertaId],
  );

  const totais = useMemo(() => {
    const lista = ordens.data ?? [];
    return {
      quantidade: lista.length,
      aPagar: lista
        .filter((o) => o.status !== "cancelada")
        .reduce((soma, o) => soma + o.total_liquido, 0),
      pagas: lista.filter((o) => o.status === "paga").length,
      aguardando: lista.filter((o) => o.status === "fechada" && !o.liberada_para_pagamento).length,
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

  if (ordemAberta) {
    return (
      <Window title="Pagamentos — ordem" className="h-full">
        <OrdemDetalhe ordem={ordemAberta} onVoltar={() => setOrdemAbertaId(null)} />
      </Window>
    );
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
        <ClassicButton
          variant="primary"
          onClick={() => void apurarAgora()}
          disabled={apurar.isPending}
        >
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
                <IndicatorSlot label="Aguardando autorização" value={totais.aguardando} />
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
                  supervisor: ordem.supervisor_nome ?? "—",
                  itens: ordem.itens,
                  liquido: moeda(ordem.total_liquido),
                  devedor: ordem.saldo_devedor_atual > 0 ? moeda(ordem.saldo_devedor_atual) : "—",
                  autorizacoes: resumoAutorizacoes(ordem),
                  status: ROTULO_STATUS[ordem.status] ?? ordem.status,
                  acao: (
                    <ClassicButton onClick={() => setOrdemAbertaId(ordem.id)}>Abrir</ClassicButton>
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
    </Window>
  );
}
