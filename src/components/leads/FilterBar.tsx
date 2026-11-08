"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "../icons";
import type { MultiOption } from "../menu/MultiSelect";
import { cn } from "../ui";

export type FilterGroup = { key: string; label: string; options: MultiOption[]; selected: string[]; searchable?: boolean };
export type DateFilters = { created_from?: string; created_to?: string; contacted_from?: string; contacted_to?: string };

const DATE_LABEL: Record<keyof DateFilters, string> = { created_from: "Added from", created_to: "Added to", contacted_from: "Last call from", contacted_to: "Last call to" };
const DATE_KEYS = Object.keys(DATE_LABEL) as (keyof DateFilters)[];

/** Sections of the filter panel, each listing filter keys in display order. */
const SECTIONS: { title: string; keys: string[]; dates?: (keyof DateFilters)[]; callable?: boolean }[] = [
  { title: "Lead", keys: ["status", "product", "interest", "stage", "owner", "salesperson"] },
  { title: "Calls", keys: ["outcome", "attempts", "followup"], callable: true },
  { title: "Location", keys: ["area", "city", "state", "tz"] },
  { title: "Contact", keys: ["suppression", "email"] },
  { title: "Source & dates", keys: ["import"], dates: DATE_KEYS },
];

type Draft = { values: Record<string, string[]>; dates: DateFilters; callable: boolean };

/**
 * Leads toolbar: a Filters button that opens a grouped panel (a slide-over on desktop, a
 * full-screen sheet on phones). Choices are staged in the panel and applied together; the
 * panel shows how many leads the staged filters would give. Active filters show as chips.
 */
export function FilterBar({ groups, dates, callable, search }: { groups: FilterGroup[]; dates: DateFilters; callable: boolean; search?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function apply(changes: Record<string, string | string[] | undefined>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      const value = Array.isArray(v) ? v.join(",") : v;
      if (value) p.set(k, value);
      else p.delete(k);
    }
    for (const legacy of ["page", "msg", "called", "due"]) p.delete(legacy);
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const clearAll = Object.fromEntries([...groups.map((g) => [g.key, undefined]), ...DATE_KEYS.map((k) => [k, undefined]), ["callable", undefined]]);
  const chips = [
    ...groups.flatMap((g) => g.selected.map((v) => ({ id: `${g.key}:${v}`, label: `${g.label}: ${g.options.find((o) => o.value === v)?.label ?? v}`, remove: () => apply({ [g.key]: g.selected.filter((x) => x !== v) }) }))),
    ...DATE_KEYS.filter((k) => dates[k]).map((k) => ({ id: k, label: `${DATE_LABEL[k]} ${dates[k]}`, remove: () => apply({ [k]: undefined }) })),
    ...(callable ? [{ id: "callable", label: "OK to call now", remove: () => apply({ callable: undefined }) }] : []),
  ];

  return (
    <div data-testid="filter-bar">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {search && <div className="min-w-0 flex-1">{search}</div>}
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary px-3" aria-haspopup="dialog" aria-expanded={open} data-testid="filters-button">
          <Icon name="filter" className="size-4" /> Filters
          {chips.length > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white tabular-nums">{chips.length}</span>}
        </button>
        {chips.length > 0 && (
          <button type="button" onClick={() => apply(clearAll)} className="btn-ghost btn-sm px-2">Clear<span className="hidden sm:inline">&nbsp;filters</span></button>
        )}
        {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
          {chips.map((c) => (
            <button key={c.id} type="button" onClick={c.remove} className="chip py-0.5" title="Remove this filter">
              {c.label} <Icon name="x" className="size-3" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <FilterPanel
          groups={groups}
          initial={{ values: Object.fromEntries(groups.map((g) => [g.key, g.selected])), dates, callable }}
          onClose={() => setOpen(false)}
          onApply={(d) => {
            apply({ ...Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, v])), ...d.dates, callable: d.callable ? "now" : undefined });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FilterPanel({ groups, initial, onClose, onApply }: { groups: FilterGroup[]; initial: Draft; onClose: () => void; onApply: (d: Draft) => void }) {
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => Object.fromEntries(groups.map((g) => [g.key, g])), [groups]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Live count for the staged filters (search kept from the page).
  useEffect(() => {
    const p = new URLSearchParams();
    const q = params.get("q");
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(draft.values)) if (v.length) p.set(k, v.join(","));
    for (const k of DATE_KEYS) if (draft.dates[k]) p.set(k, draft.dates[k]!);
    if (draft.callable) p.set("callable", "now");
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/leads/count?${p.toString()}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setTotal(j.total))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [draft, params]);

  const set = (key: string, values: string[]) => setDraft((d) => ({ ...d, values: { ...d.values, [key]: values } }));
  const staged = Object.values(draft.values).reduce((n, v) => n + v.length, 0) + DATE_KEYS.filter((k) => draft.dates[k]).length + (draft.callable ? 1 : 0);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="presentation">
      <button type="button" aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" tabIndex={-1} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-label="Filters"
        data-testid="filters-panel"
        className="relative flex h-full w-full flex-col bg-surface shadow-pop outline-none sm:max-w-md sm:border-l sm:border-line"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-fg">Filters</h2>
            <p className="text-xs text-muted">{staged ? `${staged} selected` : "Narrow the leads list"}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close"><Icon name="x" className="size-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {SECTIONS.map((section) => (
            <section key={section.title} className="border-b border-line py-3 last:border-b-0">
              <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-subtle uppercase">{section.title}</h3>
              {section.keys.filter((k) => byKey[k]).map((k) => (
                <FilterRow key={k} group={byKey[k]} selected={draft.values[k] ?? []} open={expanded === k} onToggle={() => setExpanded(expanded === k ? null : k)} onChange={(v) => set(k, v)} />
              ))}
              {section.callable && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-2.5 text-sm text-fg">
                  <span>OK to call now<span className="block text-xs text-muted">Inside legal calling hours at the shop</span></span>
                  <input type="checkbox" checked={draft.callable} onChange={(e) => setDraft((d) => ({ ...d, callable: e.target.checked }))} className="size-4" data-testid="panel-callable" />
                </label>
              )}
              {section.dates && (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 px-1 pb-1">
                  {section.dates.map((k) => (
                    <label key={k} className="text-xs text-muted">
                      {DATE_LABEL[k]}
                      <input type="date" value={draft.dates[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, dates: { ...d.dates, [k]: e.target.value || undefined } }))} className="input mt-1 py-1.5" />
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => setDraft({ values: Object.fromEntries(groups.map((g) => [g.key, []])), dates: {}, callable: false })} className="btn-ghost">Reset</button>
          <button type="button" onClick={() => onApply(draft)} className="btn-primary flex-1" data-testid="filters-apply">
            {total === null ? "Show leads" : `Show ${total} lead${total === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One filter in the panel: a row with a summary that expands into a checklist with counts. */
function FilterRow({ group, selected, open, onToggle, onChange }: { group: FilterGroup; selected: string[]; open: boolean; onToggle: () => void; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const summary = selected.length === 0 ? "Any" : selected.length === 1 ? group.options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${selected.length} selected`;
  const shown = query ? group.options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : group.options;
  return (
    <div data-testid={`panel-${group.key}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left text-sm hover:bg-surface-2">
        <span className="font-medium text-fg">{group.label}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate text-xs", selected.length ? "font-medium text-brand-fg" : "text-muted")}>{summary}</span>
          <Icon name="chevronDown" className={cn("size-4 shrink-0 text-subtle transition", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="mb-2 rounded-lg border border-line bg-surface-2 p-1.5">
          {group.searchable && group.options.length > 8 && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find ${group.label.toLowerCase()}…`} aria-label={`Find ${group.label.toLowerCase()}`} className="input mb-1 py-1.5" />
          )}
          <div className="max-h-60 overflow-y-auto">
            {shown.length === 0 && <div className="px-2 py-2 text-xs text-muted">Nothing matches.</div>}
            {shown.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label key={o.value} className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface", o.count === 0 && !on ? "text-subtle" : "text-fg-2")}>
                  <input type="checkbox" checked={on} onChange={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="text-xs text-subtle tabular-nums">{o.count}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-muted hover:bg-surface">Clear {group.label.toLowerCase()}</button>
          )}
        </div>
      )}
    </div>
  );
}

