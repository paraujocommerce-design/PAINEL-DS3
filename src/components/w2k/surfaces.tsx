import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Janela clássica: moldura em relevo + título + conteúdo. */
export function Window({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("w2k-out flex min-h-0 flex-col p-[3px]", className)}>
      <TitleBar title={title} actions={actions} />
      <div className="flex min-h-0 flex-1 flex-col p-2">{children}</div>
    </section>
  );
}

export function TitleBar({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="w2k-titlebar flex items-center justify-between gap-2 px-2 py-[3px]">
      <h2 className="truncate text-sm font-bold tracking-tight">{title}</h2>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

/** Painel agrupador (equivalente ao GroupBox clássico). */
export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w2k-groove bg-surface p-3", className)}>
      {title ? (
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}

export function StatusBar({ items }: { items: ReactNode[] }) {
  return (
    <div className="flex items-stretch gap-[3px] p-[2px]">
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "w2k-in truncate px-2 py-[2px] text-xs text-muted-foreground",
            index === 0 ? "flex-1" : "shrink-0",
          )}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
