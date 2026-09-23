import { createFileRoute } from "@tanstack/react-router";
import { CertificadoDigitalModule } from "@/features/certificado-digital/certificado-digital-module";

const DESC = "Frente própria de Certificado Digital com Kanban de leads, indicadores diários e metas de prospecção.";

export const Route = createFileRoute("/certificado-digital")({
  head: () => ({
    meta: [
      { title: "Certificado Digital — Painel de Gestão DS3" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Certificado Digital — Painel de Gestão DS3" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: CertificadoDigital,
});

function CertificadoDigital() {
  return <CertificadoDigitalModule />;
}
