import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas — Painel de Gestão DS3" },
      {
        name: "description",
        content: "Módulo reservado para alertas. Nenhuma regra automática foi implementada.",
      },
      { property: "og:title", content: "Alertas — Painel de Gestão DS3" },
      {
        property: "og:description",
        content: "Módulo reservado para alertas. Nenhuma regra automática foi implementada.",
      },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Alertas"
      description="Módulo reservado para alertas. Nenhuma regra automática foi implementada."
      sections={[
        { title: "Alertas ativos", description: "Área reservada. Regras ainda não definidas." },
        { title: "Histórico", description: "Área reservada. Regras ainda não definidas." },
      ]}
    />
  );
}
