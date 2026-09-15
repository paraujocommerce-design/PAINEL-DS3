import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte DS3 — Painel de Gestão DS3" },
      {
        name: "description",
        content: "Área operacional de suporte. Não é tratada como frente de vendas.",
      },
      { property: "og:title", content: "Suporte DS3 — Painel de Gestão DS3" },
      {
        property: "og:description",
        content: "Área operacional de suporte. Não é tratada como frente de vendas.",
      },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Suporte DS3"
      description="Área operacional de suporte. Não é tratada como frente de vendas."
      sections={[
        { title: "Atendimentos", description: "Área reservada. Regras ainda não definidas." },
        { title: "Pendências", description: "Área reservada. Regras ainda não definidas." },
        {
          title: "Acompanhamento operacional",
          description: "Área reservada. Regras ainda não definidas.",
        },
      ]}
    />
  );
}
