import { useMemo, useState } from "react";
import {
  Alert,
  ClassicButton,
  EmptyState,
  LoadingState,
  Panel,
  Toolbar,
  ToolbarSeparator,
} from "@/components/w2k";
import { useRelatorioPagamento, type LinhaRelatorio, type OrdemPagamento } from "./api";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function competenciaPorExtenso(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

type MembroEquipe = {
  id: string;
  codigo: string;
  nome: string;
  contratos: number;
  valor: number;
  linhas: LinhaRelatorio[];
};

/** Agrupa as comissões de liderança por representante da equipe. */
function agruparEquipe(linhas: LinhaRelatorio[]): MembroEquipe[] {
  const mapa = new Map<string, MembroEquipe>();
  for (const linha of linhas) {
    if (!linha.e_da_equipe) continue;
    const atual = mapa.get(linha.origem_representante_id);
    if (atual) {
      atual.contratos += 1;
      atual.valor += linha.valor_liquido;
      atual.linhas.push(linha);
    } else {
      mapa.set(linha.origem_representante_id, {
        id: linha.origem_representante_id,
        codigo: linha.origem_codigo,
        nome: linha.origem_nome,
        contratos: 1,
        valor: linha.valor_liquido,
        linhas: [linha],
      });
    }
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Relatório de pagamento — o documento do representante.
 * A ordem é interna; isto é o que ele recebe e confere.
 */
export function RelatorioPagamento({
  ordem,
  onVoltar,
}: {
  ordem: OrdemPagamento;
  onVoltar: () => void;
}) {
  const relatorio = useRelatorioPagamento(ordem.id);
  const linhas = useMemo(() => relatorio.data ?? [], [relatorio.data]);

  const proprias = useMemo(() => linhas.filter((l) => !l.e_da_equipe), [linhas]);
  const equipe = useMemo(() => agruparEquipe(linhas), [linhas]);
  const ehLider = equipe.length > 0;

  // Todos os membros entram por padrão; o líder pode emitir parcial.
  const [selecionados, setSelecionados] = useState<string[] | null>(null);
  const membrosAtivos = useMemo(
    () => (selecionados === null ? equipe : equipe.filter((m) => selecionados.includes(m.id))),
    [equipe, selecionados],
  );
  const parcial = selecionados !== null && membrosAtivos.length !== equipe.length;

  const totalProprio = useMemo(
    () => proprias.reduce((soma, l) => soma + l.valor_liquido, 0),
    [proprias],
  );
  const totalEquipe = useMemo(
    () => membrosAtivos.reduce((soma, m) => soma + m.valor, 0),
    [membrosAtivos],
  );

  function alternar(id: string) {
    const base = selecionados ?? equipe.map((m) => m.id);
    setSelecionados(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  }

  if (relatorio.isLoading) return <LoadingState />;

  return (
    <div className="flex flex-col gap-[3px]">
      <Toolbar className="print:hidden">
        <ClassicButton onClick={onVoltar}>← Voltar à ordem</ClassicButton>
        <ToolbarSeparator />
        <ClassicButton variant="primary" onClick={() => window.print()}>
          Imprimir / salvar em PDF
        </ClassicButton>
      </Toolbar>

      {ehLider ? (
        <Panel title="Equipe no relatório" className="print:hidden">
          <p className="mb-2 text-xs">
            Este representante é líder. Escolha se o relatório sai com a equipe inteira ou só com
            alguns.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={selecionados === null || selecionados.length === equipe.length}
                onChange={(e) => setSelecionados(e.target.checked ? null : [])}
              />
              <strong>Equipe inteira</strong>
            </label>
            {equipe.map((membro) => (
              <label key={membro.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={(selecionados ?? equipe.map((m) => m.id)).includes(membro.id)}
                  onChange={() => alternar(membro.id)}
                />
                {membro.codigo} — {membro.nome}
              </label>
            ))}
          </div>
        </Panel>
      ) : null}

      {ordem.status !== "paga" ? (
        <Alert tone="warning" title={`Ordem ainda ${ordem.status} — este relatório é uma prévia`}>
          Os valores só são definitivos depois que a ordem é paga.
        </Alert>
      ) : null}

      {/* ===== o documento ===== */}
      <div className="bg-surface p-4 text-sm">
        <header className="mb-3 border-b border-bevel-dark pb-2">
          <h2 className="text-base font-bold">Relatório de pagamento</h2>
          <p>
            <strong>
              {ordem.representante_codigo} — {ordem.representante_nome}
            </strong>
          </p>
          <p>
            Competência {competenciaPorExtenso(ordem.competencia)}
            {ordem.supervisor_nome ? ` · Supervisor: ${ordem.supervisor_nome}` : ""}
          </p>
          <p>Favorecido: {ordem.favorecido_efetivo ?? "não cadastrado"}</p>
          {parcial ? (
            <p>
              <em>
                Relatório parcial — equipe limitada a{" "}
                {membrosAtivos.map((m) => m.nome).join(", ") || "nenhum representante"}.
              </em>
            </p>
          ) : null}
        </header>

        <h3 className="mb-1 font-bold">Valores do representante</h3>
        {proprias.length === 0 ? (
          <EmptyState title="Nenhum valor próprio nesta competência." />
        ) : (
          <table className="mb-3 w-full text-left">
            <thead>
              <tr className="border-b border-bevel-dark">
                <th className="py-1">Rubrica</th>
                <th className="py-1">Contrato</th>
                <th className="py-1">Data</th>
                <th className="py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {proprias.map((linha) => (
                <tr key={linha.item_id} className="border-b border-bevel-light">
                  <td className="py-1">
                    {linha.rotulo}
                    {linha.observacao ? (
                      <span className="block text-xs text-muted-foreground">
                        {linha.observacao}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1">
                    {linha.codigo_contrato ?? "—"}
                    {linha.nome_fantasia ? (
                      <span className="block text-xs text-muted-foreground">
                        {linha.nome_fantasia}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1">{formatarData(linha.data_referencia)}</td>
                  <td className="py-1 text-right">{moeda(linha.valor_liquido)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 font-bold" colSpan={3}>
                  Subtotal do representante
                </td>
                <td className="py-1 text-right font-bold">{moeda(totalProprio)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {ehLider ? (
          <>
            <h3 className="mb-1 font-bold">Recebido pela equipe</h3>
            {membrosAtivos.length === 0 ? (
              <EmptyState title="Nenhum representante da equipe selecionado." />
            ) : (
              <table className="mb-3 w-full text-left">
                <thead>
                  <tr className="border-b border-bevel-dark">
                    <th className="py-1">Representante</th>
                    <th className="py-1">Contratos</th>
                    <th className="py-1">Códigos</th>
                    <th className="py-1 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {membrosAtivos.map((membro) => (
                    <tr key={membro.id} className="border-b border-bevel-light">
                      <td className="py-1">
                        {membro.codigo} — {membro.nome}
                      </td>
                      <td className="py-1">{membro.contratos}</td>
                      <td className="py-1 text-xs">
                        {membro.linhas.map((l) => l.codigo_contrato ?? "—").join(", ")}
                      </td>
                      <td className="py-1 text-right">{moeda(membro.valor)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 font-bold" colSpan={3}>
                      Subtotal da equipe
                    </td>
                    <td className="py-1 text-right font-bold">{moeda(totalEquipe)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </>
        ) : null}

        <div className="border-t-2 border-bevel-dark pt-2">
          <p className="flex justify-between text-base font-bold">
            <span>Total a receber</span>
            <span>{moeda(totalProprio + totalEquipe)}</span>
          </p>
          {ordem.saldo_devedor_atual > 0 ? (
            <p className="mt-1 text-xs">
              Saldo devedor em aberto: {moeda(ordem.saldo_devedor_atual)} — será descontado nas
              próximas vendas.
            </p>
          ) : null}
          {ordem.status === "paga" ? (
            <p className="mt-1 text-xs">
              Pago em {formatarData(ordem.data_pagamento)} por {ordem.forma_pagamento}
              {ordem.comprovante ? ` — comprovante ${ordem.comprovante}` : ""}.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Emitido em {new Date().toLocaleDateString("pt-BR")} pelo Painel de Gestão DS3.
          </p>
        </div>
      </div>
    </div>
  );
}
