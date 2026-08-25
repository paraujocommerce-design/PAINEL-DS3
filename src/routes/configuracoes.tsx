import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Painel de Gestão DS3" },
      { name: "description", content: "Somente a estrutura necessária nesta fase." },
      { property: "og:title", content: "Configurações — Painel de Gestão DS3" },
      { property: "og:description", content: "Somente a estrutura necessária nesta fase." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Configurações"
      description="Somente a estrutura necessária nesta fase."
      sections={[
        { title: "Aplicação", description: "Área reservada. Regras ainda não definidas." },
        { title: "Acesso", description: "Área reservada. Regras ainda não definidas." },
      ]}
    />
  );
}
