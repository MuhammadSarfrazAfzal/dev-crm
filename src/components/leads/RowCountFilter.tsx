"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui";

const PRESETS = [25, 50, 100, 250];

export function RowCountFilter({
  current = 25,
  total,
  defaultCount = 25,
}: {
  current?: number;
  total: number;
  defaultCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(String(current));
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setCustomValue(String(current));
    }
  }, [open, current]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function applyRows(rows: number) {
    if (isNaN(rows) || rows <= 0) return;
    const clamped = Math.min(1000, Math.max(1, Math.round(rows)));
    const p = new URLSearchParams(searchParams.toString());
    if (clamped === defaultCount) {
      p.delete("rows");
      p.delete("limit");
      p.delete("size");
    } else {
      p.set("rows", String(clamped));
      p.delete("limit");
      p.delete("size");
    }
    p.delete("page");
    setOpen(false);
    startTransition(() => {
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function handleCustomApply() {
    const val = parseInt(customValue.trim(), 10);
    if (!isNaN(val) && val > 0) {
      applyRows(val);
    }
  }

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm transition hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand/40",
          open && "ring-2 ring-brand/40 border-brand",
          pending && "opacity-60"
        )}
        title="Custom row filter: select or enter how many rows to display"
      >
        <span className="text-muted font-normal">Show:</span>
        <span className="font-semibold text-fg tabular-nums">{current} rows</span>
        <Icon
          name="chevronDown"
          className={cn("size-3.5 text-muted transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Row filter options"
          className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-line bg-surface p-3 shadow-pop animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
            <span className="text-xs font-semibold text-fg">Rows per page</span>
            {total > 0 && (
              <span className="text-[11px] text-muted tabular-nums">of {total} total</span>
            )}
          </div>

          {/* Quick presets */}
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {PRESETS.map((preset) => {
              const active = current === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyRows(preset)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border py-1.5 text-xs font-medium tabular-nums transition",
                    active
                      ? "border-brand bg-brand-soft text-brand-fg font-semibold shadow-sm"
                      : "border-line bg-surface-2/60 text-fg hover:bg-surface-2 hover:border-line-hover"
                  )}
                >
                  <span>{preset}</span>
                </button>
              );
            })}
          </div>

          {/* Custom row input - div instead of form so it works inside outer table form */}
          <div className="space-y-1.5">
            <label htmlFor="custom-row-input" className="block text-[11px] font-medium text-muted">
              Custom count (1–1000)
            </label>
            <div className="flex gap-1.5">
              <input
                id="custom-row-input"
                type="number"
                min="1"
                max="1000"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCustomApply();
                  }
                }}
                placeholder="e.g. 75"
                className="input py-1 px-2.5 text-xs tabular-nums flex-1"
                autoFocus
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCustomApply();
                }}
                className="btn-primary py-1 px-3 text-xs whitespace-nowrap"
                data-testid="apply-custom-rows"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
