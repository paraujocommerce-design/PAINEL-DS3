/**
 * Estrutura de navegação do Painel de Gestão DS3.
 * Fonte única de verdade para o menu lateral.
 */
export type NavLink = {
  label: string;
  to: string;
  params?: Record<string, string>;
  children?: NavLink[];
};

export type NavGroup = { label: string; links: NavLink[] };

export const SUPERVISORES = [
  { slug: "berg", label: "Berg" },
  { slug: "clenio", label: "Clênio" },
] as const;

export type SupervisorSlug = (typeof SUPERVISORES)[number]["slug"];

export function findSupervisor(slug: string) {
  return SUPERVISORES.find((supervisor) => supervisor.slug === slug);
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Gestão",
    links: [
      { label: "Visão Geral", to: "/" },
      {
        label: "Representantes",
        to: "/representantes",
        children: SUPERVISORES.map((supervisor) => ({
          label: supervisor.label,
          to: "/representantes/$supervisor",
          params: { supervisor: supervisor.slug },
        })),
      },
      { label: "Contratos", to: "/contratos" },
      { label: "Prefeituras", to: "/prefeituras" },
      { label: "Vendas Internas", to: "/vendas-internas" },
      { label: "Certificado Digital", to: "/certificado-digital" },
      { label: "Suporte DS3", to: "/suporte" },
    ],
  },
  {
    label: "Análise",
    links: [
      { label: "Pessoas", to: "/pessoas" },
      { label: "Ações Gerenciais", to: "/acoes-gerenciais" },
      { label: "Alertas", to: "/alertas" },
      { label: "Relatórios", to: "/relatorios" },
    ],
  },
  {
    label: "Sistema",
    links: [
      { label: "Importação", to: "/importacao" },
      { label: "Configurações", to: "/configuracoes" },
    ],
  },
];
