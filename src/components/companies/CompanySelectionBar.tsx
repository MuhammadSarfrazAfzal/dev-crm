"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { cn } from "@/components/ui";

export function CompanySelectionBar() {
  const [selected, setSelected] = useState(0);
  const [totalOnPage, setTotalOnPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    const count = () => {
      const all = Array.from(
        form.querySelectorAll<HTMLInputElement>('tbody input[name="ids"], ul input[name="ids"]')
      );
      setTotalOnPage(all.length);
      setSelected(all.filter((c) => c.checked).length);
    };
    count();
    form.addEventListener("change", count);
    return () => form.removeEventListener("change", count);
  }, []);

  function selectAllOnPage() {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    const all = form.querySelectorAll<HTMLInputElement>('input[name="ids"]');
    all.forEach((c) => (c.checked = true));
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearSelection() {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    const all = form.querySelectorAll<HTMLInputElement>('input[name="ids"]');
    all.forEach((c) => (c.checked = false));
    form.dispatchEvent(new Event("change", { bubbles: true }));
    setSelected(0);
  }

  function getSelectedIds(): string[] {
    const form = containerRef.current?.closest("form");
    if (!form) return [];
    const checked = form.querySelectorAll<HTMLInputElement>(
      'tbody input[name="ids"]:checked, ul input[name="ids"]:checked'
    );
    return Array.from(checked).map((c) => c.value);
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex items-center gap-2 text-sm", selected === 0 && "hidden")}
      data-testid="company-selection-bar"
    >
      <span className="font-medium text-fg tabular-nums">{selected} selected</span>
      <span className="text-subtle" aria-hidden>·</span>
      {selected < totalOnPage ? (
        <>
          <button
            type="button"
            onClick={selectAllOnPage}
            className="btn-ghost btn-sm text-brand-fg hover:bg-brand-soft"
            data-testid="company-select-all-page"
          >
            Select all {totalOnPage} on page
          </button>
          <span className="text-subtle" aria-hidden>·</span>
        </>
      ) : (
        <>
          <span className="text-xs text-muted">All {totalOnPage} on page selected</span>
          <span className="text-subtle" aria-hidden>·</span>
        </>
      )}
      <DeleteButton
        kind="companies"
        variant="bar"
        testId="delete-selected-companies"
        getIds={getSelectedIds}
      />
      <button type="button" onClick={clearSelection} className="btn-ghost btn-sm">
        Clear
      </button>
    </div>
  );
}
