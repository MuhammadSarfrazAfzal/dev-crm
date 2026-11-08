"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { cn } from "../ui";
import { arrowNavigate, usePopover } from "./usePopover";

export type MultiOption = { value: string; label: string; count?: number };

/**
 * A filter button that opens an in-page checklist (with counts, optional search) under it.
 * Each tick calls `onChange` with the new selection right away.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
  testId,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  testId?: string;
}) {
  const { open, setOpen, trigger, panel, style, placement } = usePopover({ width: 260 });
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  // Keep chosen values visible even if no lead currently has them.
  const missing = selected.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v, count: 0 }));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const active = selected.length > 0;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm whitespace-nowrap transition",
          active ? "border-brand-line bg-brand-soft font-medium text-brand-fg" : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2",
        )}
      >
        {label}
        {active && <span className="rounded bg-brand px-1 text-[11px] text-white tabular-nums">{selected.length}</span>}
        <Icon name="chevronDown" className={cn("size-3.5 transition", open && "rotate-180")} />
      </button>
      {mounted && open &&
        createPortal(
          <div
            ref={panel}
            role="listbox"
            aria-multiselectable
            aria-label={label}
            onKeyDown={(e) => arrowNavigate(e, panel.current)}
            style={style}
            data-placement={placement}
            data-testid={testId ? `${testId}-menu` : undefined}
            className="z-[60] flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-pop"
          >
            {searchable && (
              <div className="border-b border-line p-1.5">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Find ${label.toLowerCase()}…`}
                  aria-label={`Find ${label.toLowerCase()}`}
                  className="input py-1.5"
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {[...missing, ...shown].length === 0 && <div className="px-2.5 py-2 text-muted">Nothing matches.</div>}
              {[...missing, ...shown].map((o) => {
                const on = selected.includes(o.value);
                return (
                  <div
                    key={o.value}
                    role="option"
                    tabIndex={-1}
                    aria-selected={on}
                    onClick={() => toggle(o.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(o.value);
                      }
                    }}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-surface-2 focus:bg-surface-2", o.count === 0 && !on ? "text-subtle" : "text-fg-2")}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-line-strong")}>
                      {on && <Icon name="check" className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="shrink-0 text-xs text-subtle tabular-nums">{o.count}</span>}
                  </div>
                );
              })}
            </div>
            {active && (
              <div className="border-t border-line p-1">
                <button type="button" onClick={() => onChange([])} className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted hover:bg-surface-2">
                  Clear {label.toLowerCase()}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
