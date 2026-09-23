import { useState } from "react";
import { ClassicButton, LoadingState, Panel, Toolbar, Window } from "@/components/w2k";
import { useMetasProspecao, useAtualizarMetaProspecao } from "./api";

const FRENTES = {
  cliente: "Clientes CD",
  parceiro_contador: "Parceiros Contadores",
  representante: "Representantes",
};

export function MetasProspecao() {
  const metas = useMetasProspecao();
  const atualizar = useAtualizarMetaProspecao();
  const [edicao, setEdicao] = useState<Record<string, number>>({});

  return (
    <Window title="Metas Diárias de Prospecção" className="h-full">
      <Toolbar>
        <h2 className="font-bold">Configure as metas diárias para cada frente</h2>
      </Toolbar>

      <Panel>
        {metas.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {Object.entries(FRENTES).map(([frente, label]) => {
              const meta = (metas.data ?? []).find((m) => m.frente === frente);
              const valor = edicao[frente] ?? meta?.meta_diaria ?? 0;

              return (
                <div key={frente} className="border rounded p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">{label}</div>
                      <div className="text-sm text-muted-foreground">Meta diária configurável</div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min="0"
                        value={valor}
                        onChange={(e) => setEdicao({ ...edicao, [frente]: parseInt(e.target.value) || 0 })}
                        className="border rounded px-3 py-1 w-20 text-sm"
                      />
                      <span className="text-sm font-bold">/dia</span>
                      <ClassicButton
                        variant="primary"
                        onClick={() => {
                          atualizar.mutate({ frente: frente as any, meta_diaria: valor });
                          setEdicao({ ...edicao, [frente]: undefined });
                        }}
                      >
                        Salvar
                      </ClassicButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </Window>
  );
}
