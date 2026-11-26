import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

import { ApiError } from "../api/client";
import { formatMoney, riskBand, statusClass, statusLabel } from "../lib/format";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size,
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const classes = ["btn", `btn--${variant}`, size === "sm" ? "btn--sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Money({
  value,
  large = false,
  muted = false,
}: {
  value: string | null | undefined;
  large?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={large ? "amount-large" : "numeric"}
      style={muted ? { color: "var(--ink-500)" } : undefined}
    >
      {formatMoney(value)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={statusClass(status)}>
      <span className="badge__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const band = riskBand(score);
  return (
    <span className="risk" aria-label={`Skor risiko ${score} dari 100`}>
      <span className="risk__bar" aria-hidden="true">
        <span
          className={`risk__fill risk__fill--${band}`}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </span>
      <span className="risk__value">{score}</span>
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description === undefined ? null : (
          <p className="page-header__description">{description}</p>
        )}
      </div>
      {actions === undefined ? null : <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, meta }: { label: string; value: ReactNode; meta?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {meta === undefined ? null : <div className="stat__meta">{meta}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon ?? <AlertTriangle size={18} />}
      </div>
      <div className="empty-state__title">{title}</div>
      <p className="empty-state__body">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div className="error-state" role="alert">
      <div className="row row--between">
        <strong>{apiError?.message ?? "Terjadi kesalahan saat memuat data"}</strong>
        {onRetry === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        )}
      </div>
      <div className="error-state__code">
        {apiError?.code ?? "ERR_INTERNAL_ERROR"}
        {apiError?.correlationId === null || apiError?.correlationId === undefined
          ? ""
          : ` · ${apiError.correlationId}`}
      </div>
    </div>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <div>
        {title === undefined ? null : <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel__body stack stack--sm" aria-label="Memuat data" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton skeleton--row" />
      ))}
    </div>
  );
}

function useDialogBehaviour(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusable = container?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || container === null) {
        return;
      }
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (items.length === 0) {
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  return containerRef;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const containerRef = useDialogBehaviour(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        ref={containerRef}
      >
        <div className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description === undefined ? null : (
              <p id={descriptionId} className="muted small">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup dialog">
            <X size={16} />
          </Button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer === undefined ? null : <div className="dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const containerRef = useDialogBehaviour(open, onClose);
  const titleId = useId();

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={containerRef}
      >
        <div className="drawer__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description === undefined ? null : <p className="muted small">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Tutup panel">
            <X size={16} />
          </Button>
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
