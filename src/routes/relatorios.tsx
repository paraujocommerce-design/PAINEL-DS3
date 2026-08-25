import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Painel de Gestão DS3" },
      { name: "description", content: "Módulo reservado para relatórios. Nenhum relatório analítico foi implementado." },
      { property: "og:title", content: "Relatórios — Painel de Gestão DS3" },
      { property: "og:description", content: "Módulo reservado para relatórios. Nenhum relatório analítico foi implementado." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Relatórios"
      description="Módulo reservado para relatórios. Nenhum relatório analítico foi implementado."
      sections={[
        { title: "Relatórios disponíveis", description: "Área reservada. Regras ainda não definidas." },
      ]}
    />
  );
}
