import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Painel de Gestão DS3" },
      {
        name: "description",
        content: "Área reservada para a futura gestão individual por função.",
      },
      { property: "og:title", content: "Pessoas — Painel de Gestão DS3" },
      {
        property: "og:description",
        content: "Área reservada para a futura gestão individual por função.",
      },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Pessoas"
      description="Área reservada para a futura gestão individual por função."
      sections={[
        { title: "Cadastro", description: "Área reservada. Regras ainda não definidas." },
        { title: "Funções", description: "Área reservada. Regras ainda não definidas." },
        {
          title: "Acompanhamento individual",
          description: "Área reservada. Regras ainda não definidas.",
        },
      ]}
    />
  );
}
