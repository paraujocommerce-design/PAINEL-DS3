import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Window, Tabs, EmptyState } from "@/components/w2k";

const DESC = "Frente própria de Certificado Digital, separada das demais frentes comerciais.";

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

const AREAS = [
  { value: "visao-geral", label: "Visão geral" },
  { value: "producao", label: "Produção" },
  { value: "emissoes", label: "Emissões" },
  { value: "renovacoes", label: "Renovações" },
  { value: "clientes", label: "Clientes" },
  { value: "representantes", label: "Representantes" },
  { value: "parceiros", label: "Parceiros/Contadores" },
  { value: "custos", label: "Custos" },
  { value: "certificadoras", label: "Certificadoras" },
  { value: "conversoes", label: "Conversões" },
];

function CertificadoDigital() {
  const [tab, setTab] = useState(AREAS[0]!.value);
  const atual = AREAS.find((area) => area.value === tab);

  return (
    <Window title="Certificado Digital" className="h-full">
      <p className="mb-2 max-w-prose text-sm text-muted-foreground">
        {DESC} Organização interna preparada; nenhuma regra, cálculo ou custo foi implementado.
      </p>
      <Tabs items={AREAS} value={tab} onChange={setTab}>
        <EmptyState
          title="Nenhum dado registrado."
          description={`Área "${atual?.label}" reservada. Definições comerciais pendentes.`}
        />
      </Tabs>
    </Window>
  );
}
