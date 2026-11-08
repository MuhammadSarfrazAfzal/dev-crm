"use client";

import { useEffect } from "react";

/** Marks the page as scrolling for a moment after any scroll, so scrollbars show only then. */
export function ScrollActivity() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      document.documentElement.dataset.scrolling = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete document.documentElement.dataset.scrolling, 900);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timer);
    };
  }, []);
  return null;
}
