import { createFileRoute } from "@tanstack/react-router";
import { ContratosModule } from "@/features/contratos/contratos-module";

export const Route = createFileRoute("/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos — Painel de Gestão DS3" },
      {
        name: "description",
        content:
          "Lançamento de contratos de representantes, com premiação, comissão de liderança e valor do plano.",
      },
      { property: "og:title", content: "Contratos — Painel de Gestão DS3" },
      {
        property: "og:description",
        content:
          "Lançamento de contratos de representantes, com premiação, comissão de liderança e valor do plano.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return <ContratosModule />;
}
