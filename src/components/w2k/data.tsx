import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column = { key: string; label: string; align?: "left" | "right" };

/**
 * Tabela compacta clássica.
 * `rows` vazio nunca é preenchido com dados artificiais: renderiza o estado vazio.
 */
export function Table({
  columns,
  rows,
  emptyMessage = "Nenhum dado registrado.",
  caption,
}: {
  columns: Column[];
  rows?: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
  caption?: string;
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;

  return (
    <div className="w2k-in w2k-scroll overflow-x-auto bg-input">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "w2k-out border-b-2 px-2 py-[3px] text-xs font-bold",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-border/40">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-2 py-[3px]",
                      column.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Estado vazio real — jamais substituído por zeros ou dados fictícios. */
export function EmptyState({
  title = "Nenhum dado registrado para o período.",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="w2k-in flex flex-col items-center justify-center gap-2 bg-input px-4 py-10 text-center">
      <p className="text-sm font-bold">{title}</p>
      {description ? (
        <p className="max-w-prose text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Estado de carregamento padrão do sistema. */
export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="w2k-in bg-input px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/** Slot de indicador: sem valor => "Sem dado" (ausência ≠ zero). */
export function IndicatorSlot({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value?: number | string | undefined;
  unit?: string | undefined;
  note?: string | undefined;
}) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <div className="w2k-in flex min-w-0 flex-col gap-1 bg-input px-3 py-2">
      <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn("font-mono text-lg", hasValue ? "text-foreground" : "text-muted-foreground")}
      >
        {hasValue ? `${value}${unit ? ` ${unit}` : ""}` : "Sem dado"}
      </span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}
