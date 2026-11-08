"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar, Badge } from "@/components/ui";
import { AuditActionBadge, getActionInfo } from "./AuditActionBadge";

export type AuditLogItem = {
  id: number | string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: string | null;
  formatted_time: string;
  relative_time: string;
};

export function AuditDetailsModal({
  log,
  onClose,
}: {
  log: AuditLogItem | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!log) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [log, onClose]);

  if (!log) return null;

  const info = getActionInfo(log.action);
  const jsonString = JSON.stringify(log.details, null, 2);

  function handleCopy() {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-pop animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg border border-line bg-surface-2 p-2 text-fg">
              <Icon name={info.icon} className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="audit-modal-title" className="text-lg font-semibold text-fg">
                  {info.label}
                </h2>
                <Badge tone={info.tone}>{info.category}</Badge>
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted">Action: {log.action}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Close dialog"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Quick Info Grid */}
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-line bg-surface-2/40 p-3.5 text-xs">
          <div>
            <span className="text-muted">Actor</span>
            <div className="mt-1 flex items-center gap-1.5 font-medium text-fg">
              {log.actor ? (
                <>
                  <Avatar name={log.actor} className="size-5 text-[10px]" />
                  <span className="truncate">{log.actor}</span>
                </>
              ) : (
                <span className="text-subtle">Automated System</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-muted">Target Entity</span>
            <div className="mt-1 font-medium text-fg capitalize">
              {log.entity ? `${log.entity}` : "—"}
            </div>
          </div>

          <div>
            <span className="text-muted">Timestamp</span>
            <div className="mt-1 font-medium text-fg tabular-nums" title={log.formatted_time}>
              {log.relative_time}
            </div>
          </div>

          <div>
            <span className="text-muted">Log Entry ID</span>
            <div className="mt-1 font-mono text-xs text-fg-2 truncate" title={String(log.id)}>
              #{String(log.id).slice(0, 8)}
            </div>
          </div>
        </div>

        {/* Structured Details Preview if available */}
        {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
          <div className="mb-4">
            <span className="mb-1.5 block text-xs font-medium text-muted">Key Attributes</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(log.details).map(([key, val]) => {
                if (typeof val === "object" && val !== null) return null;
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs"
                  >
                    <span className="text-muted">{key}:</span>
                    <span className="font-medium text-fg">{String(val)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Payload / JSON View */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Event Payload (JSON)</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-fg hover:underline"
            >
              <Icon name={copied ? "check" : "copy"} className="size-3.5" />
              <span>{copied ? "Copied!" : "Copy JSON"}</span>
            </button>
          </div>
          <pre className="max-h-60 overflow-auto rounded-xl border border-line bg-surface-2/80 p-3.5 font-mono text-xs leading-relaxed text-fg">
            {jsonString}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            {log.entity === "leads" && log.entity_id && (
              <Link href={`/leads/${log.entity_id}`} className="btn-secondary btn-sm gap-1.5">
                <Icon name="leads" className="size-3.5" /> Open Lead Record
              </Link>
            )}
            {log.entity === "imports" && log.entity_id && (
              <Link href={`/imports/${log.entity_id}`} className="btn-secondary btn-sm gap-1.5">
                <Icon name="upload" className="size-3.5" /> Open Import Record
              </Link>
            )}
            {log.entity === "companies" && log.entity_id && (
              <Link href={`/companies/${log.entity_id}`} className="btn-secondary btn-sm gap-1.5">
                <Icon name="companies" className="size-3.5" /> Open Company Record
              </Link>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-primary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
