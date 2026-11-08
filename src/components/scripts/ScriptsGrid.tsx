"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/icons";
import { SCRIPT_TYPE_ICON, ScriptText } from "@/components/ScriptText";
import { ProductBadge } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { SCRIPT_TYPE_LABEL, type Product, type ScriptType } from "@/lib/labels";
import { deleteSelectedScripts } from "@/app/actions/scripts";
import type { ActionState } from "@/app/actions/lead";

export type ScriptCardData = {
  script_key: string;
  version: number;
  product: string | null;
  script_type: string;
  title: string;
  body: string;
  created_at: Date | string;
  versions: number;
};

export function ScriptsGrid({
  scripts,
  canDelete = true,
}: {
  scripts: ScriptCardData[];
  canDelete?: boolean;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkState, bulkAction, bulkPending] = useActionState<ActionState, FormData>(deleteSelectedScripts, {});

  const allSelected = scripts.length > 0 && selectedKeys.length === scripts.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(scripts.map((s) => s.script_key));
    }
  };

  const toggleSelectOne = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  useEffect(() => {
    if (!confirmBulk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bulkPending) setConfirmBulk(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmBulk, bulkPending]);

  return (
    <div>
      {/* Bulk Selection Bar / Navbar */}
      {canDelete && scripts.length > 0 && (
        <div
          className={`sticky top-3 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm backdrop-blur-md transition-all ${
            selectedKeys.length > 0
              ? "border-brand-line bg-surface/95 shadow-card"
              : "border-line bg-surface/90"
          }`}
          data-testid="scripts-selection-navbar"
        >
          <label className="flex items-center gap-2 font-medium text-fg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="size-4 rounded border-line cursor-pointer"
              aria-label="Select all scripts"
            />
            <span>Select all ({scripts.length})</span>
          </label>

          {selectedKeys.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-fg">
                {selectedKeys.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                className="btn-ghost px-2 py-1 text-xs text-muted hover:text-fg"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulk(true)}
                className="btn-primary inline-flex items-center gap-1.5 bg-danger px-3 py-1 text-xs font-medium text-white transition hover:bg-danger-strong"
                data-testid="navbar-delete-selected"
              >
                <Icon name="trash" className="size-3.5" />
                Delete selected ({selectedKeys.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid of Scripts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {scripts.map((s) => {
          const isSelected = selectedKeys.includes(s.script_key);
          return (
            <article
              key={s.script_key}
              className={`card flex flex-col p-5 transition hover:border-line-strong ${
                isSelected ? "border-brand-line bg-brand-soft/20 ring-2 ring-brand/15" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {canDelete && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(s.script_key)}
                      aria-label={`Select script ${s.title}`}
                      className="mt-2.5 size-4 rounded border-line cursor-pointer shrink-0"
                    />
                  )}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted">
                    <Icon name={SCRIPT_TYPE_ICON[s.script_type as ScriptType]} />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/scripts/${s.script_key}`}
                      className="block font-semibold text-fg hover:text-brand-fg"
                    >
                      {s.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <ProductBadge product={s.product as Product | null} />
                      <span>{SCRIPT_TYPE_LABEL[s.script_type as ScriptType]}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <CopyButton text={s.body} label="Copy" className="btn-secondary btn-sm" />
                </div>
              </div>

              <div className="relative mt-4 max-h-40 flex-1 overflow-hidden">
                <ScriptText body={s.body} />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface"
                  aria-hidden
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>
                  Version {s.version}
                  {s.versions > 1 ? ` of ${s.versions}` : ""} · updated {relativeTime(s.created_at)}
                </span>
                <Link
                  href={`/scripts/${s.script_key}`}
                  className="link inline-flex items-center gap-1"
                >
                  Read full script <Icon name="arrowRight" className="size-3" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {/* Bulk Delete Modal with User Confirmation */}
      {confirmBulk && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkPending) setConfirmBulk(false);
          }}
        >
          <div className="card w-full max-w-md p-6 shadow-pop animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-fg">
                <Icon name="trash" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-fg">
                  Delete {selectedKeys.length} script{selectedKeys.length === 1 ? "" : "s"}?
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Are you sure you want to delete the selected {selectedKeys.length} script{selectedKeys.length === 1 ? "" : "s"}? All versions will be permanently removed. This action cannot be undone.
                </p>
                {bulkState.error && (
                  <p className="mt-2 text-xs font-medium text-danger-fg">{bulkState.error}</p>
                )}
              </div>
            </div>

            <form action={bulkAction} className="mt-6 flex items-center justify-end gap-2">
              {selectedKeys.map((k) => (
                <input key={k} type="hidden" name="scriptKeys" value={k} />
              ))}
              <button
                type="button"
                disabled={bulkPending}
                onClick={() => setConfirmBulk(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkPending}
                className="btn-primary inline-flex items-center gap-1.5 bg-danger text-xs hover:bg-danger-strong"
              >
                <Icon name="trash" className="size-3.5" />
                {bulkPending ? "Deleting…" : `Delete ${selectedKeys.length} script${selectedKeys.length === 1 ? "" : "s"}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
