import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function ClassicButton({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "w2k-out min-w-[72px] px-3 py-[3px] text-sm text-surface-foreground",
        "active:w2k-pressed active:translate-[0.5px] disabled:text-muted-foreground disabled:opacity-70",
        variant === "primary" && "font-bold",
        className,
      )}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-surface-foreground">
        {label}
      </label>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w2k-in bg-input px-2 py-[3px] text-sm text-foreground placeholder:text-muted-foreground",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn("w2k-in bg-input px-1 py-[3px] text-sm text-foreground", className)}
    >
      {children}
    </select>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "error";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "w2k-groove flex gap-2 bg-surface p-2 text-sm",
        tone === "warning" && "border-warning",
        tone === "error" && "border-destructive",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[1px] size-4 shrink-0 border-2 border-bevel-dark text-center text-xs font-bold leading-3",
          tone === "info" && "bg-primary text-primary-foreground",
          tone === "warning" && "bg-warning text-warning-foreground",
          tone === "error" && "bg-destructive text-destructive-foreground",
        )}
      >
        {tone === "info" ? "i" : "!"}
      </span>
      <div>
        <p className="font-bold">{title}</p>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

/** Barra de progresso clássica em blocos. Sem valor => indeterminado/indisponível. */
export function Progress({ value, label }: { value?: number; label?: string }) {
  const blocks = 20;
  const filled = value == null ? 0 : Math.round((Math.min(Math.max(value, 0), 100) / 100) * blocks);

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progresso"}
        className="w2k-in flex h-4 items-stretch gap-[2px] bg-input p-[2px]"
      >
        {Array.from({ length: blocks }, (_, index) => (
          <span
            key={index}
            className={cn("flex-1", index < filled ? "bg-primary" : "bg-transparent")}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {value == null ? "Indisponível" : `${value}%`}
      </span>
    </div>
  );
}
