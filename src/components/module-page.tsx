import type { ReactNode } from "react";
import { Window, Panel, EmptyState } from "@/components/w2k";

export type ModuleSection = { title: string; description: string };

/**
 * Página padrão de módulo desta fase: descrição do escopo + áreas previstas
 * em estado vazio real (nenhum dado é inventado).
 */
export function ModulePage({
  title,
  description,
  sections,
  emptyTitle = "Nenhum dado registrado.",
  emptyDescription = "Estrutura criada nesta fase. As regras e os dados deste módulo ainda não foram definidos.",
  children,
  toolbar,
}: {
  title: string;
  description: string;
  sections?: ModuleSection[];
  emptyTitle?: string;
  emptyDescription?: string;
  children?: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <Window title={title} actions={toolbar} className="h-full">
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">{description}</p>

      {children ?? <EmptyState title={emptyTitle} description={emptyDescription} />}

      {sections && sections.length > 0 ? (
        <div className="mt-3 grid gap-[3px] sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Panel key={section.title} title={section.title}>
              <p className="text-xs text-muted-foreground">{section.description}</p>
              <p className="mt-2 text-xs">Sem dados.</p>
            </Panel>
          ))}
        </div>
      ) : null}
    </Window>
  );
}
