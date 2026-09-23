import { LoadingState, Panel, Toolbar, Window } from "@/components/w2k";
import { usePainelDepartamento, useMetaMensalAtual } from "./api-completo";

export function PainelDepartamento() {
  const painel = usePainelDepartamento();
  const meta = useMetaMensalAtual();

  return (
    <Window title="Painel do Departamento" className="h-full">
      <Toolbar>
        <h2 className="font-bold">Visão consolidada: produção, metas e funnels</h2>
      </Toolbar>

      <Panel>
        {painel.isLoading || meta.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            {/* Meta mensal consolidada */}
            {meta.data && (
              <div className="border rounded p-4 bg-blue-50">
                <h3 className="font-bold mb-2">Meta Mensal Atual</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Meta Geral</div>
                    <div className="font-bold text-lg">{meta.data.meta_mensal_geral}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Convertidos até hoje</div>
                    <div className="font-bold text-lg">{meta.data.convertidos_mes}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Serasa (mín-máx)</div>
                    <div className="font-bold text-lg">
                      {meta.data.serasa_mes} / {meta.data.meta_serasa_minimo}-{meta.data.meta_serasa_maximo}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Progresso</div>
                    <div className="font-bold text-lg">
                      {Math.round((meta.data.convertidos_mes / meta.data.meta_mensal_geral) * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Grid de operadores */}
            <div className="grid grid-cols-1 gap-4">
              <h3 className="font-bold">Produção por Operador</h3>
              {(painel.data ?? []).map((op) => (
                <div key={op.usuario_id} className="border rounded p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold">{op.nome_completo}</div>
                      <div className="text-sm text-muted-foreground">
                        {op.tipo_operador === "operador_emissao" ? "Operador de Emissão" : "Prospector"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Hoje</div>
                      <div className="font-bold text-lg">{op.indicadores_hoje}</div>
                    </div>
                  </div>

                  {/* Kanban funnel counts */}
                  <div className="grid grid-cols-6 gap-2 text-sm">
                    <div className="border-l-4 border-green-500 pl-2">
                      <div className="text-xs text-muted-foreground">Novo Lead</div>
                      <div className="font-bold">{op.novo_lead_total}</div>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-2">
                      <div className="text-xs text-muted-foreground">Contato</div>
                      <div className="font-bold">{op.contato_realizado_total}</div>
                    </div>
                    <div className="border-l-4 border-blue-500 pl-2">
                      <div className="text-xs text-muted-foreground">Qualificado</div>
                      <div className="font-bold">{op.qualificado_total}</div>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-2">
                      <div className="text-xs text-muted-foreground">Negociação</div>
                      <div className="font-bold">{op.negociacao_total}</div>
                    </div>
                    <div className="border-l-4 border-green-600 pl-2">
                      <div className="text-xs text-muted-foreground">Convertido</div>
                      <div className="font-bold">{op.convertido_total}</div>
                    </div>
                    <div className="border-l-4 border-red-500 pl-2">
                      <div className="text-xs text-muted-foreground">Perdido</div>
                      <div className="font-bold">{op.perdido_total}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </Window>
  );
}
