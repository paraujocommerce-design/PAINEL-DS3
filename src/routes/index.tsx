import { createFileRoute } from "@tanstack/react-router";
import { Window, Panel, EmptyState, IndicatorSlot, Alert } from "@/components/w2k";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão Geral — Painel de Gestão DS3" },
      {
        name: "description",
        content:
          "Cockpit executivo da DS3: estrutura preparada para resultados, metas, saúde das frentes, alertas e ações pendentes.",
      },
      { property: "og:title", content: "Visão Geral — Painel de Gestão DS3" },
      {
        property: "og:description",
        content: "Cockpit executivo da DS3 — fundação técnica sem dados registrados.",
      },
    ],
  }),
  component: VisaoGeral,
});

const INDICADORES = [
  "Resultado consolidado",
  "Meta do período",
  "Saúde das frentes",
  "Ações pendentes",
];

function VisaoGeral() {
  return (
    <Window title="Visão Geral — Cockpit executivo" className="h-full">
      <Alert title="Fundação técnica">
        Nenhuma regra comercial, meta ou cálculo foi implementado nesta fase. Os blocos abaixo são
        áreas reservadas e permanecem sem dado até que as definições sejam autorizadas.
      </Alert>

      <div className="mt-3 grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
        {INDICADORES.map((label) => (
          <IndicatorSlot key={label} label={label} note="Aguardando definição" />
        ))}
      </div>

      <div className="mt-3 grid gap-[3px] lg:grid-cols-2">
        <Panel title="Saúde das frentes">
          <EmptyState
            title="Nenhum dado registrado para o período."
            description="As frentes (Representantes, Prefeituras, Vendas Internas, Certificado Digital e Suporte DS3) serão avaliadas após a definição dos indicadores."
          />
        </Panel>
        <Panel title="Alertas e ações pendentes">
          <EmptyState
            title="Nenhum alerta registrado."
            description="Regras de alerta e ações gerenciais ainda não foram definidas."
          />
        </Panel>
      </div>

      <div className="mt-[3px]">
        <Panel title="Pessoas e frentes que exigem atenção">
          <EmptyState
            title="Nenhum registro."
            description="Nenhuma pessoa ou frente foi cadastrada. Nada é exibido como zero na ausência de dado."
          />
        </Panel>
      </div>
    </Window>
  );
}
