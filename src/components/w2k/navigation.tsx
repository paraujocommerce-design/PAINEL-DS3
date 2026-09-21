import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export type Menu = { label: string; items: MenuItem[] };

/** Barra de menus clássica (Arquivo, ...). */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-stretch bg-surface" role="menubar">
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === menu.label}
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            className={cn(
              "px-3 py-[3px] text-sm",
              open === menu.label
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {menu.label}
          </button>
          {open === menu.label ? (
            <div
              role="menu"
              aria-label={menu.label}
              className="w2k-out absolute left-0 top-full z-50 min-w-[180px] p-[2px]"
            >
              {menu.items.map((item) => (
                <div key={item.label}>
                  {item.separatorBefore ? (
                    <div className="my-1 border-t border-bevel-shadow border-b border-b-bevel-highlight" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.onSelect?.();
                    }}
                    className={cn(
                      "block w-full px-3 py-[3px] text-left text-sm",
                      item.disabled
                        ? "text-muted-foreground"
                        : "hover:bg-primary hover:text-primary-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1 bg-surface px-1 py-[3px]", className)}>
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return (
    <span
      aria-hidden
      className="mx-1 h-5 w-px bg-bevel-shadow shadow-[1px_0_0_var(--color-bevel-highlight)]"
    />
  );
}

export type TabItem = { value: string; label: string };

/** Abas clássicas. Controladas pelo chamador. */
export function Tabs({
  items,
  value,
  onChange,
  children,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex items-end gap-[2px] pl-1">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={cn(
                "w2k-out border-b-0 px-3 text-sm",
                active ? "relative z-10 py-[5px] font-bold" : "py-[3px] text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="w2k-out min-h-0 flex-1 p-3">
        {children}
      </div>
    </div>
  );
}
