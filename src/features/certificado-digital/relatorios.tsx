import { useState } from "react";
import { ClassicButton, LoadingState, Panel, Toolbar, Window } from "@/components/w2k";
import { usePainelDepartamento, useMetaMensalAtual } from "./api";

export function Relatorios() {
  const painel = usePainelDepartamento();
  const meta = useMetaMensalAtual();
  const [filtro, setFiltro] = useState<"diario" | "mensal">("mensal");
  const [operadorSelecionado, setOperadorSelecionado] = useState<string | null>(null);

  const operadoresToodos = (painel.data ?? []).map((op) => ({
    id: op.usuario_id,
    nome: op.nome_completo,
  }));

  const operadorAtual = operadorSelecionado
    ? (painel.data ?? []).find((op) => op.usuario_id === operadorSelecionado)
    : null;

  return (
    <Window title="Relatórios" className="h-full">
      <Toolbar>
        <h2 className="font-bold">Desempenho realizado vs meta</h2>
        <div className="flex gap-2 ml-auto">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as any)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="mensal">Mensal</option>
            <option value="diario">Diário</option>
          </select>
          <select
            value={operadorSelecionado || ""}
            onChange={(e) => setOperadorSelecionado(e.target.value || null)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">Departamento (consolidado)</option>
            {operadoresToodos.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </div>
      </Toolbar>

      <Panel>
        {painel.isLoading || meta.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            {/* Relatório consolidado ou individual */}
            {!operadorAtual ? (
              // Departamento
              <div className="border rounded p-6">
                <h3 className="font-bold text-lg mb-4">Desempenho Departamental</h3>
                {meta.data && (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded">
                        <div className="text-sm text-muted-foreground">Meta Mensal</div>
                        <div className="text-3xl font-bold">{meta.data.meta_mensal_geral}</div>
                        <div className="text-sm mt-1">conversões planejadas</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded">
                        <div className="text-sm text-muted-foreground">Realizadas</div>
                        <div className="text-3xl font-bold">{meta.data.convertidos_mes}</div>
                        <div className="text-sm mt-1">
                          {Math.round((meta.data.convertidos_mes / meta.data.meta_mensal_geral) * 100)}% da meta
                        </div>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded">
                        <div className="text-sm text-muted-foreground">Serasa</div>
                        <div className="text-3xl font-bold">
                          {meta.data.serasa_mes}/{meta.data.meta_serasa_minimo}-{meta.data.meta_serasa_maximo}
                        </div>
                        <div className="text-sm mt-1">vendas cruzadas este mês</div>
                      </div>
                    </div>

                    {/* Tabela por etapa do funnel */}
                    <div className="border-t pt-4">
                      <h4 className="font-bold mb-3">Funnel por Etapa</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between py-1">
                          <span>Novo Lead</span>
                          <span className="font-bold">
                            {(painel.data ?? []).reduce((sum, op) => sum + op.novo_lead_total, 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Contato Realizado</span>
                          <span className="font-bold">
                            {(painel.data ?? []).reduce((sum, op) => sum + op.contato_realizado_total, 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Qualificado</span>
                          <span className="font-bold">
                            {(painel.data ?? []).reduce((sum, op) => sum + op.qualificado_total, 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Negociação/Documentação</span>
                          <span className="font-bold">
                            {(painel.data ?? []).reduce((sum, op) => sum + op.negociacao_total, 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-t pt-1 font-bold">
                          <span>Convertido</span>
                          <span>{(painel.data ?? []).reduce((sum, op) => sum + op.convertido_total, 0)}</span>
                        </div>
                        <div className="flex justify-between py-1 text-red-600">
                          <span>Perdido</span>
                          <span>{(painel.data ?? []).reduce((sum, op) => sum + op.perdido_total, 0)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Individual
              <div className="border rounded p-6">
                <h3 className="font-bold text-lg mb-4">{operadorAtual.nome_completo}</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded">
                    <div className="text-sm text-muted-foreground">Conversões</div>
                    <div className="text-2xl font-bold">{operadorAtual.convertido_total}</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded">
                    <div className="text-sm text-muted-foreground">Perdidos</div>
                    <div className="text-2xl font-bold">{operadorAtual.perdido_total}</div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-bold mb-3">Funnel Individual</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Novo Lead</span>
                      <span className="font-bold">{operadorAtual.novo_lead_total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Contato Realizado</span>
                      <span className="font-bold">{operadorAtual.contato_realizado_total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Qualificado</span>
                      <span className="font-bold">{operadorAtual.qualificado_total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Negociação</span>
                      <span className="font-bold">{operadorAtual.negociacao_total}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-bold">
                      <span>Convertido</span>
                      <span>{operadorAtual.convertido_total}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notas sobre o período */}
            <div className="border rounded p-4 bg-gray-50 text-sm text-muted-foreground">
              {filtro === "mensal" ? (
                <div>Dados consolidados do mês atual. Meta estrutural: 300 conversões/mês.</div>
              ) : (
                <div>Dados do dia de hoje. Compare com as metas diárias individuais.</div>
              )}
            </div>
          </div>
        )}
      </Panel>
    </Window>
  );
}
