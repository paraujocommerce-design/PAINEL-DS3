import { createFileRoute } from "@tanstack/react-router";
import { PagamentosModule } from "@/features/pagamentos/pagamentos-module";

export const Route = createFileRoute("/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos — Painel de Gestão DS3" },
      {
        name: "description",
        content:
          "Ordens de pagamento dos representantes: premiação, liderança, Meta Plus, incentivo e saldo devedor.",
      },
      { property: "og:title", content: "Pagamentos — Painel de Gestão DS3" },
      {
        property: "og:description",
        content:
          "Ordens de pagamento dos representantes: premiação, liderança, Meta Plus, incentivo e saldo devedor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  return <PagamentosModule />;
}
