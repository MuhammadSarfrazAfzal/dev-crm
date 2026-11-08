"use client";

import { useState } from "react";
import { SCRIPT_TYPE_LABEL, type Product, type ScriptType } from "@/lib/labels";
import { CopyButton } from "../CopyButton";
import { cn, EmptyState } from "../ui";

export type ScriptItem = { id: string; script_key: string; version: number; script_type: ScriptType; product: Product | null; title: string; body: string };

/** Fills {{placeholders}} we know; unknown ones stay visible so the rep notices them. */
export function fillScript(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => vars[key] || m);
}

export function ScriptsPanel({ scripts, vars }: { scripts: ScriptItem[]; vars: Record<string, string | null | undefined> }) {
  const [active, setActive] = useState(scripts[0]?.id);
  if (!scripts.length) return <EmptyState>No scripts yet.</EmptyState>;
  const current = scripts.find((s) => s.id === active) ?? scripts[0];
  const text = fillScript(current.body, vars);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {scripts.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === current.id} onClick={() => setActive(s.id)}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", s.id === current.id ? "border-brand bg-brand-soft text-brand-fg" : "border-line-strong text-muted hover:bg-surface-2")}>
            {SCRIPT_TYPE_LABEL[s.script_type]}
            {s.product && <span className="ml-1 opacity-70">· {s.product === "pos" ? "POS" : "Wholesale"}</span>}
          </button>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-fg">{current.title} <span className="text-xs font-normal text-muted">v{current.version}</span></div>
        <CopyButton text={text} label="Copy script" className="btn-secondary px-2.5 py-1 text-xs" />
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-fg">{text}</pre>
    </div>
  );
}
