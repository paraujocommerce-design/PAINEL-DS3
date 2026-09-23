import { useState } from "react";
import { ClassicButton, Panel, Toolbar, Window } from "@/components/w2k";
import { KanbanLeads } from "./kanban-leads";
import { DashboardIndicadores } from "./dashboard-indicadores";
import { MetasProspecao } from "./metas-prospecao";
import { PainelDepartamento } from "./painel-departamento";
import { Relatorios } from "./relatorios";

export function CertificadoDigitalModule() {
  const [aba, setAba] = useState<"kanban" | "indicadores" | "metas" | "departamento" | "relatorios">("kanban");

  return (
    <>
      <Toolbar>
        <h1 className="text-lg font-bold">Certificado Digital</h1>
        <div className="flex gap-2 ml-auto flex-wrap">
          <ClassicButton variant={aba === "kanban" ? "primary" : "default"} onClick={() => setAba("kanban")}>
            Kanban
          </ClassicButton>
          <ClassicButton variant={aba === "indicadores" ? "primary" : "default"} onClick={() => setAba("indicadores")}>
            Indicadores
          </ClassicButton>
          <ClassicButton variant={aba === "metas" ? "primary" : "default"} onClick={() => setAba("metas")}>
            Metas
          </ClassicButton>
          <ClassicButton variant={aba === "departamento" ? "primary" : "default"} onClick={() => setAba("departamento")}>
            Departamento
          </ClassicButton>
          <ClassicButton variant={aba === "relatorios" ? "primary" : "default"} onClick={() => setAba("relatorios")}>
            Relatórios
          </ClassicButton>
        </div>
      </Toolbar>

      <Panel>
        {aba === "kanban" && <KanbanLeads />}
        {aba === "indicadores" && <DashboardIndicadores />}
        {aba === "metas" && <MetasProspecao />}
        {aba === "departamento" && <PainelDepartamento />}
        {aba === "relatorios" && <Relatorios />}
      </Panel>
    </>
  );
}
