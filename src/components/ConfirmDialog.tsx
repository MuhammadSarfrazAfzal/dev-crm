"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";
import { cn } from "./ui";

/** A centred confirm box (Escape or a click outside cancels), used before deleting or assigning. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  icon,
  pending,
  error,
  onConfirm,
  onCancel,
  testId = "confirm-dialog",
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  icon: IconName;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" role="presentation" onClick={() => !pending && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={`${testId}-title`} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-pop" data-testid={testId}>
        <div className="flex items-start gap-3">
          <span className={cn("rounded-full p-2", tone === "danger" ? "bg-danger-soft text-danger-fg" : "bg-brand-soft text-brand-fg")}><Icon name={icon} className="size-5" /></span>
          <div className="min-w-0">
            <h2 id={`${testId}-title`} className="text-base font-semibold text-fg">{title}</h2>
            <div className="mt-1 text-sm text-muted">{body}</div>
            {error && <p className="mt-2 text-sm font-medium text-danger-fg" role="alert">{error}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={pending} data-testid={`${testId}-confirm`}>
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
