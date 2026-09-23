import { useState } from "react";
import { ClassicButton, EmptyState, LoadingState, Panel, Toolbar, Window } from "@/components/w2k";
import { useIndicadoresDiarios, useMetasProspecao, useRegistrarIndicador, useVendasSerasa } from "./api";
import { usePapelUsuario } from "@/lib/papel-usuario";

const TIPOS_INDICADORES = {
  prospeccoes_realizadas: "Prospecções realizadas",
  convertidos: "Convertidos (Vendas)",
  prospectados: "Prospectados",
  ativados_convertidos: "Ativados/Convertidos",
  nova_emissao: "Nova emissão",
  renovacao: "Renovação",
  prospecção: "Prospecção",
  proposta_enviada: "Proposta enviada",
};

export function DashboardIndicadores() {
  const papel = usePapelUsuario();
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const indicadores = useIndicadoresDiarios(papel?.userId || "", data);
  const metas = useMetasProspecao();
  const serasa = useVendasSerasa();
  const registrar = useRegistrarIndicador();

  const isGabryela = papel?.email?.includes("gabryela");
  const isDudaPedro = papel?.email?.includes("duda") || papel?.email?.includes("pedro");

  const resumenDia = (frente?: string) => {
    return (indicadores.data ?? [])
      .filter((i) => !frente || i.frente === frente)
      .reduce((acc, i) => {
        acc[i.tipo_indicador] = (acc[i.tipo_indicador] || 0) + i.total;
        return acc;
      }, {} as Record<string, number>);
  };

  return (
    <Window title="Indicadores Diários" className="h-full">
      <Toolbar>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
      </Toolbar>

      <Panel>
        {indicadores.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            {isGabryela && (
              <>
                <div>
                  <h3 className="font-bold mb-3">Prospecção - Clientes</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {["cliente", "parceiro_contador", "representante"].map((frente) => {
                      const resumo = resumenDia(frente);
                      const meta = (metas.data ?? []).find((m) => m.frente === frente);
                      return (
                        <div key={frente} className="bg-blue-50 dark:bg-blue-900 p-3 rounded">
                          <div className="font-bold text-sm">
                            {frente === "cliente" ? "Clientes" : frente === "parceiro_contador" ? "Parceiros" : "Representantes"}
                          </div>
                          <div className="text-2xl font-bold text-blue-600 mt-2">
                            {resumo["prospeccoes_realizadas"] || 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Meta: {meta?.meta_diaria || 0}/dia
                          </div>
                          <div className="flex gap-1 mt-2">
                            <ClassicButton
                              onClick={() =>
                                registrar.mutate({ usuario_id: papel?.userId || "", tipo: "prospeccoes_realizadas", frente, data })
                              }
                            >
                              +1
                            </ClassicButton>
                            <ClassicButton
                              onClick={() =>
                                registrar.mutate({ usuario_id: papel?.userId || "", tipo: "convertidos", frente, data })
                              }
                            >
                              Venda
                            </ClassicButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {isDudaPedro && (
              <>
                <div>
                  <h3 className="font-bold mb-3">Emissão de Certificados</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {["nova_emissao", "renovacao", "prospecção", "proposta_enviada", "convertidos"].map((tipo) => {
                      const quantidade = resumenDia()?.[tipo] || 0;
                      return (
                        <div key={tipo} className="bg-green-50 dark:bg-green-900 p-3 rounded">
                          <div className="font-bold text-sm">
                            {TIPOS_INDICADORES[tipo as keyof typeof TIPOS_INDICADORES]}
                          </div>
                          <div className="text-2xl font-bold text-green-600 mt-2">{quantidade}</div>
                          <button
                            onClick={() => registrar.mutate({ usuario_id: papel?.userId || "", tipo, data })}
                            className="bg-green-600 text-white px-2 py-1 text-xs rounded mt-2"
                          >
                            +1
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold mb-3">Venda Cruzada Serasa (Mês Atual)</h3>
                  <div className="bg-purple-50 dark:bg-purple-900 p-4 rounded">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Vendido este mês</div>
                        <div className="text-3xl font-bold text-purple-600">
                          {(serasa.data ?? [])
                            .filter((s) => s.usuario_id === papel?.userId)
                            .reduce((acc, s) => acc + s.total_vendido, 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Meta mensal</div>
                        <div className="text-3xl font-bold text-purple-600">
                          {(serasa.data ?? [])
                            .filter((s) => s.usuario_id === papel?.userId)
                            .map((s) => s.meta)[0] || 0}
                        </div>
                      </div>
                      <div>
                        <ClassicButton variant="primary" onClick={() => registrar.mutate({ usuario_id: papel?.userId || "", tipo: "venda_serasa", data })}>
                          Registrar Venda Serasa
                        </ClassicButton>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Panel>
    </Window>
  );
}
