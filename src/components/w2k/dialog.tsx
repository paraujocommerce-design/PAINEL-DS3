import { useEffect, type ReactNode } from "react";
import { TitleBar } from "./surfaces";

/** Dialog modal clássico. Renderizado apenas quando `open`. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-bevel-dark/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w2k-out w-full max-w-lg p-[3px]"
      >
        <TitleBar title={title} />
        <div className="p-3 text-sm">{children}</div>
        {footer ? <div className="flex justify-end gap-2 px-3 pb-3">{footer}</div> : null}
      </div>
    </div>
  );
}
