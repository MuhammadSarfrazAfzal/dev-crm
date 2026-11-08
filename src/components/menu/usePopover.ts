"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const GAP = 4;
const MARGIN = 8;

/**
 * Open/close state and placement for an in-page menu anchored to a trigger: right under it
 * and aligned to it (left or right edge), flipped above only when there's no room below,
 * kept on screen, and closed by Escape or a click outside. The panel is fixed-positioned
 * so cards with clipped edges never cut it off.
 */
export function usePopover({ width, align = "left" }: { width?: number; align?: "left" | "right" | "center" } = {}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const b = trigger.current?.getBoundingClientRect();
    const p = panel.current;
    if (!b || !p) return;
    const w = Math.min(width ?? Math.max(b.width, 200), window.innerWidth - 2 * MARGIN);
    const h = p.offsetHeight;
    const below = window.innerHeight - b.bottom - GAP - MARGIN;
    const above = b.top - GAP - MARGIN;
    const up = h > below && above > below;
    const maxHeight = Math.max(160, up ? above : below);
    const rawLeft = align === "center" ? b.left + (b.width - w) / 2 : align === "right" ? b.right - w : b.left;
    const left = Math.min(Math.max(MARGIN, rawLeft), window.innerWidth - w - MARGIN);
    const top = up ? Math.max(MARGIN, b.top - GAP - Math.min(h, maxHeight)) : b.bottom + GAP;
    setPlacement(up ? "up" : "down");
    setStyle({ position: "fixed", top, left, width: w, maxHeight });
  }, [width, align]);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  return { open, setOpen, trigger, panel, style, placement, reposition: position };
}

/** Moves focus between the menu's items with the arrow keys. */
export function arrowNavigate(e: React.KeyboardEvent, container: HTMLElement | null, selector = "[role=option],[role=menuitem],[role=menuitemcheckbox]") {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
  const items = [...(container?.querySelectorAll<HTMLElement>(selector) ?? [])].filter((el) => !el.hasAttribute("aria-disabled"));
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next]?.focus();
}
