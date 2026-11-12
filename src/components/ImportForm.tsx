"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { Dropdown } from "./menu/Dropdown";
import { cn } from "./ui";

const FORMATS = ["CSV", "Excel", "PDF", "Word", "Text", "Images", "ZIP"];

/** Upload or paste, posted as a normal multipart form so large files stream to the server. */
export function ImportForm({ accept, owners, isAdmin, userId }: { accept: string; owners: { id: string; full_name: string }[]; isAdmin: boolean; userId: string }) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [drag, setDrag] = useState(false);
  return (
    <form action="/api/imports" method="post" encType="multipart/form-data" className="space-y-6" onSubmit={() => setBusy(true)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="assignTo">Leads go to</label>
          {isAdmin ? (
            <Dropdown id="assignTo" name="assignTo" defaultValue={userId} options={owners.map((o) => ({ value: o.id, label: o.full_name }))} />
          ) : (
            <input id="assignTo" disabled value="You" className="input" />
          )}
        </div>
        <p className="self-end pb-2 text-xs text-muted">Each shop is offered POS Development services and wholesale; what they want is noted on the call.</p>
      </div>

      <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-sm" role="tablist">
        {(["file", "paste"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition", mode === m ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-muted hover:text-fg")}>
            <Icon name={m === "file" ? "upload" : "note"} className="size-3.5" />
            {m === "file" ? "Upload a file" : "Paste text"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <label
          onDragOver={() => setDrag(true)}
          onDragLeave={() => setDrag(false)}
          onDrop={() => setDrag(false)}
          className={cn("relative flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-brand bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand-line hover:bg-brand-soft/40")}
        >
          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface text-brand-fg shadow-card ring-1 ring-line"><Icon name="upload" className="size-5" /></span>
          {file ? (
            <>
              <span className="text-sm font-semibold text-fg">{file.name}</span>
              <span className="mt-0.5 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB · click to choose another file</span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-fg">Drop a file here, or click to choose</span>
              <span className="mt-0.5 text-xs text-muted">Up to 20 MB. Scans and photos are read with on-device OCR.</span>
            </>
          )}
          <span className="mt-4 flex flex-wrap justify-center gap-1.5">
            {FORMATS.map((f) => <span key={f} className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">{f}</span>)}
          </span>
          <input
            type="file"
            name="file"
            required
            accept={accept}
            aria-label="File to import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ? { name: f.name, size: f.size } : null);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      ) : (
        <div>
          <label className="label" htmlFor="text">Paste a list</label>
          <textarea id="text" name="text" rows={10} required className="input font-mono text-xs" placeholder={"Metro Wireless - Chicago, IL - (312) 555-0101 - info@metro.example.com\nQuick Fix Phones | Houston, TX | 713-555-0102\n\nor paste rows copied from a spreadsheet"} />
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted"><Icon name="shield" className="size-3.5" /> Nothing is added until you review. Leads already in the CRM are automatically detected and cannot be re-added.</p>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Reading the file…" : <>Read and preview <Icon name="arrowRight" className="size-4" /></>}</button>
      </div>
      {busy && <p className="text-right text-xs text-muted">Scans and photos can take up to a minute.</p>}
    </form>
  );
}
