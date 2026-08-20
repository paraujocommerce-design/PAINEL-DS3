import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";

export const Route = createFileRoute("/vendas-internas")({
  head: () => ({
    meta: [
      { title: "Vendas Internas — Painel de Gestão DS3" },
      { name: "description", content: "Frente própria de Vendas Internas." },
      { property: "og:title", content: "Vendas Internas — Painel de Gestão DS3" },
      { property: "og:description", content: "Frente própria de Vendas Internas." },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return (
    <ModulePage
      title="Vendas Internas"
      description="Frente própria de Vendas Internas."
      sections={[
        { title: "Carteira", description: "Área reservada. Regras ainda não definidas." },
        { title: "Produção", description: "Área reservada. Regras ainda não definidas." },
        { title: "Acompanhamento", description: "Área reservada. Regras ainda não definidas." },
      ]}
    />
  );
}
