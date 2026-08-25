import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/acoes-gerenciais")({
  head: () => ({
    meta: [
      { title: "Ações Gerenciais — Painel de Gestão DS3" },
      { name: "description", content: "Módulo reservado para registro e acompanhamento de ações gerenciais." },
      { property: "og:title", content: "Ações Gerenciais — Painel de Gestão DS3" },
      { property: "og:description", content: "Módulo reservado para registro e acompanhamento de ações gerenciais." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Ações Gerenciais"
      description="Módulo reservado para registro e acompanhamento de ações gerenciais."
      sections={[
        { title: "Ações abertas", description: "Área reservada. Regras ainda não definidas." },
        { title: "Ações concluídas", description: "Área reservada. Regras ainda não definidas." },
      ]}
    />
  );
}
