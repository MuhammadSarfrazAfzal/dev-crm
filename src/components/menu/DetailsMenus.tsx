"use client";

import { useEffect } from "react";

/**
 * Pop-up menus built from <details data-menu> (server-rendered, e.g. Move on Follow-ups)
 * close like every other menu: on a click or tap outside, on Escape, and once an option
 * inside is picked.
 */
export function DetailsMenus() {
  useEffect(() => {
    const openMenus = () => [...document.querySelectorAll<HTMLDetailsElement>("details[data-menu][open]")];
    const onPointer = (e: PointerEvent) => {
      for (const d of openMenus()) if (!d.contains(e.target as Node)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of openMenus()) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    };
    const onSubmit = (e: Event) => {
      const d = (e.target as Element | null)?.closest?.("details[data-menu]") as HTMLDetailsElement | null;
      if (d) d.open = false;
    };
    // Only one menu open at a time.
    const onToggle = (e: Event) => {
      const t = e.target as HTMLDetailsElement;
      if (t.matches?.("details[data-menu]") && t.open) for (const d of openMenus()) if (d !== t) d.open = false;
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("toggle", onToggle, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("toggle", onToggle, true);
    };
  }, []);
  return null;
}
