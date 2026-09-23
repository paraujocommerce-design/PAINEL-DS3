import { useState } from "react";
import { ClassicButton, EmptyState, LoadingState, Panel, Toolbar, Window } from "@/components/w2k";
import { useLeadsKanban, useMudarEtapaLead } from "./api";

const ETAPAS = ["novo_lead", "contato_realizado", "qualificado_interesse", "negociacao_documentacao", "convertido"];
const ETAPAS_LABELS = {
  novo_lead: "Novo lead",
  contato_realizado: "Contato realizado",
  qualificado_interesse: "Qualificado com interesse",
  negociacao_documentacao: "Em negociação/documentação",
  convertido: "Convertido",
  perdido: "Perdido",
};

const TIPOS = {
  cliente: "Clientes CD",
  parceiro_contador: "Parceiros Contadores",
  representante: "Representantes",
};

export function KanbanLeads() {
  const [tipo, setTipo] = useState<string>("");
  const leads = useLeadsKanban(tipo || undefined);
  const mudarEtapa = useMudarEtapaLead();

  const leadsPorEtapa = ETAPAS.reduce(
    (acc, etapa) => {
      acc[etapa] = (leads.data ?? []).filter((l) => l.etapa === etapa);
      return acc;
    },
    {} as Record<string, typeof leads.data>
  );

  return (
    <Window title="Prospecção — Kanban de Leads" className="h-full">
      <Toolbar>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Toolbar>

      {leads.isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-5 gap-4 p-4">
          {ETAPAS.map((etapa) => (
            <div key={etapa} className="bg-gray-50 dark:bg-gray-900 rounded p-3">
              <h3 className="font-bold text-sm mb-3">
                {ETAPAS_LABELS[etapa as keyof typeof ETAPAS_LABELS]} ({leadsPorEtapa[etapa]?.length ?? 0})
              </h3>
              <div className="space-y-2">
                {(leadsPorEtapa[etapa] ?? []).map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white dark:bg-gray-800 border rounded p-2 cursor-move hover:shadow-md"
                  >
                    <div className="font-bold text-xs">{lead.razao_social_nome}</div>
                    <div className="text-xs text-muted-foreground mt-1">{TIPOS[lead.tipo as keyof typeof TIPOS]}</div>
                    <div className="text-xs text-red-600 mt-1">
                      {lead.dias_sem_contato > 0 && `${lead.dias_sem_contato}d sem contato`}
                    </div>
                    {etapa !== "convertido" && etapa !== "perdido" && (
                      <div className="flex gap-1 mt-2">
                        {etapa !== ETAPAS[ETAPAS.length - 1] && (
                          <ClassicButton
                            onClick={() => mudarEtapa.mutate({ id: lead.id, etapa: ETAPAS[ETAPAS.indexOf(etapa) + 1], data_contato: true })}
                          >
                            Avançar
                          </ClassicButton>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="bg-red-50 dark:bg-red-900 rounded p-3">
            <h3 className="font-bold text-sm mb-3">Perdido ({(leads.data ?? []).filter((l) => l.etapa === "perdido").length})</h3>
            <div className="space-y-2">
              {(leads.data ?? [])
                .filter((l) => l.etapa === "perdido")
                .map((lead) => (
                  <div key={lead.id} className="bg-white dark:bg-gray-800 border border-red-200 rounded p-2 text-xs">
                    <div className="font-bold">{lead.razao_social_nome}</div>
                    <div className="text-red-600 mt-1">Sem movimento por 7+ dias</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </Window>
  );
}
