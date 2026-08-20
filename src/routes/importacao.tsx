import { createFileRoute } from "@tanstack/react-router";
import { ImportacaoModule } from "@/features/importacao/importacao-module";

const DESC =
  "Importação de planilhas do Painel de Gestão DS3: validação de estrutura, detecção de duplicidades e gravação rastreável por lote.";

export const Route = createFileRoute("/importacao")({
  head: () => ({
    meta: [
      { title: "Importação — Painel de Gestão DS3" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Importação — Painel de Gestão DS3" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Importacao,
});

function Importacao() {
  return <ImportacaoModule />;
}
