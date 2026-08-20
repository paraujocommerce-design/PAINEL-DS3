import { createFileRoute } from "@tanstack/react-router";
import { PrefeiturasModule } from "@/features/prefeituras/prefeituras-module";

export const Route = createFileRoute("/prefeituras")({
  head: () => ({
    meta: [
      { title: "Prefeituras — Painel de Gestão DS3" },
      {
        name: "description",
        content:
          "Funil de novas prefeituras, histórico, contratos e renovações da frente Prefeituras.",
      },
      { property: "og:title", content: "Prefeituras — Painel de Gestão DS3" },
      {
        property: "og:description",
        content:
          "Funil de novas prefeituras, histórico, contratos e renovações da frente Prefeituras.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return <PrefeiturasModule />;
}
