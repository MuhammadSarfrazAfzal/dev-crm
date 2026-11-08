"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { usePopover } from "@/components/menu/usePopover";
import { cn } from "@/components/ui";

export function PageJumpFilter({
  page,
  pages,
  hrefTemplate,
  totalRows,
  note,
  className,
}: {
  page: number;
  pages: number;
  hrefTemplate?: string;
  totalRows?: number;
  note?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customPage, setCustomPage] = useState(String(page));
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();

  const { open, setOpen, trigger, panel, style, placement } = usePopover({
    width: 290,
    align: "center",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setCustomPage(String(page));
    }
  }, [open, page]);

  function getHref(p: number): string {
    if (hrefTemplate) {
      return hrefTemplate.replace("[page]", String(p)).replace("%d", String(p));
    }
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function navigateToPage(target: number) {
    if (isNaN(target) || target <= 0) return;
    const clamped = Math.max(1, Math.min(pages, Math.round(target)));
    setOpen(false);
    if (clamped === page) return;

    const href = getHref(clamped);
    startTransition(() => {
      router.push(href);
    });
  }

  function handleCustomSubmit() {
    const num = parseInt(customPage.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= pages) {
      navigateToPage(num);
    }
  }

  // Calculate quick page pills
  const quickPages = (() => {
    if (pages <= 8) {
      return Array.from({ length: pages }, (_, i) => i + 1);
    }
    const set = new Set<number>();
    set.add(1);
    set.add(pages);

    // Nearby pages around current
    for (let offset = -2; offset <= 2; offset++) {
      const p = page + offset;
      if (p >= 1 && p <= pages) set.add(p);
    }

    // Key milestone page if large
    if (pages >= 20) {
      set.add(Math.round(pages / 2));
    }

    return Array.from(set).sort((a, b) => a - b);
  })();

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface px-2.5 py-1 text-xs font-medium text-fg shadow-2xs transition hover:bg-surface-2 hover:border-line-hover focus:outline-none focus:ring-2 focus:ring-brand/40",
          open && "ring-2 ring-brand/40 border-brand bg-surface-2",
          pending && "opacity-60",
          className
        )}
        title={`Current page ${page} of ${pages}. Click to jump directly to any page.`}
        data-testid="page-jump-filter"
      >
        <span className="text-muted font-normal">Page</span>
        <span className="font-semibold text-fg tabular-nums">{page}</span>
        <span className="text-muted font-normal">of</span>
        <span className="font-semibold text-fg tabular-nums">{pages}</span>
        <Icon
          name="chevronDown"
          className={cn(
            "size-3 text-muted transition-transform duration-150 group-hover:text-fg",
            open && "rotate-180 text-brand-fg"
          )}
        />
      </button>

      {note && (
        <span className="text-center text-xs text-muted max-w-xs truncate">
          {note}
        </span>
      )}

      {mounted && open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Jump to page"
            style={style}
            data-placement={placement}
            className="z-[70] overflow-hidden rounded-xl border border-line bg-surface p-3 text-sm shadow-pop animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header */}
            <div className="mb-2.5 flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs font-semibold text-fg">Jump to page</span>
              <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-muted tabular-nums">
                {totalRows ? `${totalRows} rows · ` : ""}1–{pages}
              </span>
            </div>

            {/* Direct Input */}
            <div className="mb-3 space-y-1.5">
              <label htmlFor="jump-page-input" className="block text-[11px] font-medium text-muted">
                Enter page number (1–{pages})
              </label>
              <div className="flex gap-1.5">
                <input
                  id="jump-page-input"
                  type="number"
                  min="1"
                  max={pages}
                  value={customPage}
                  onChange={(e) => setCustomPage(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCustomSubmit();
                    }
                  }}
                  placeholder={`1..${pages}`}
                  className="input py-1 px-2.5 text-xs tabular-nums flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCustomSubmit();
                  }}
                  className="btn-primary py-1 px-3 text-xs whitespace-nowrap font-medium"
                  data-testid="jump-submit-btn"
                >
                  Go →
                </button>
              </div>
            </div>

            {/* Quick Page Buttons */}
            <div className="mb-2">
              <span className="mb-1.5 block text-[11px] font-medium text-muted">
                {pages <= 8 ? "Pages" : "Quick select"}
              </span>
              <div className="flex flex-wrap gap-1">
                {quickPages.map((p) => {
                  const active = p === page;
                  return (
                    <Link
                      key={p}
                      href={getHref(p)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition",
                        active
                          ? "border-brand bg-brand-soft text-brand-fg font-semibold shadow-2xs pointer-events-none"
                          : "border-line bg-surface-2/60 text-fg hover:bg-surface-2 hover:border-line-hover"
                      )}
                    >
                      {p}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Quick First / Last Shortcuts for larger pages */}
            {pages > 8 && (
              <div className="mt-2.5 flex items-center justify-between border-t border-line/80 pt-2 text-xs">
                {page > 1 ? (
                  <Link
                    href={getHref(1)}
                    onClick={() => setOpen(false)}
                    className="text-brand-fg hover:underline font-medium"
                  >
                    « First page (1)
                  </Link>
                ) : (
                  <span className="text-subtle">At first page</span>
                )}

                {page < pages ? (
                  <Link
                    href={getHref(pages)}
                    onClick={() => setOpen(false)}
                    className="text-brand-fg hover:underline font-medium"
                  >
                    Last page ({pages}) »
                  </Link>
                ) : (
                  <span className="text-subtle">At last page</span>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
