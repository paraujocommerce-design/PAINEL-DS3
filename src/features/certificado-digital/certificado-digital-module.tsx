import { useState } from "react";
import { ClassicButton, Panel, Toolbar, Window } from "@/components/w2k";
import { KanbanLeads } from "./kanban-leads";
import { DashboardIndicadores } from "./dashboard-indicadores";
import { MetasProspecao } from "./metas-prospecao";

export function CertificadoDigitalModule() {
  const [aba, setAba] = useState<"kanban" | "indicadores" | "metas">("kanban");

  return (
    <>
      <Toolbar>
        <h1 className="text-lg font-bold">Certificado Digital</h1>
        <div className="flex gap-2 ml-auto">
          <ClassicButton variant={aba === "kanban" ? "primary" : "default"} onClick={() => setAba("kanban")}>
            Kanban de Leads
          </ClassicButton>
          <ClassicButton variant={aba === "indicadores" ? "primary" : "default"} onClick={() => setAba("indicadores")}>
            Indicadores Diários
          </ClassicButton>
          <ClassicButton variant={aba === "metas" ? "primary" : "default"} onClick={() => setAba("metas")}>
            Metas de Prospecção
          </ClassicButton>
        </div>
      </Toolbar>

      <Panel>
        {aba === "kanban" && <KanbanLeads />}
        {aba === "indicadores" && <DashboardIndicadores />}
        {aba === "metas" && <MetasProspecao />}
      </Panel>
    </>
  );
}
