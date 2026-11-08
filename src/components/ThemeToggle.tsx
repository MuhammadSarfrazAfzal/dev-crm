"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

/** Runs before first paint (inlined in <head>) so the stored theme never flashes. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("crm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    // Reads the choice the head script applied; nothing to sync before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  function next() {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("crm-theme");
      else localStorage.setItem("crm-theme", t);
    } catch {
      // Storage can be blocked; the choice then lasts for this page only.
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  return (
    <button type="button" onClick={next} className="btn-ghost btn-sm px-2" title={LABEL[theme]} aria-label={LABEL[theme]}>
      <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} className="size-3.5" />
    </button>
  );
}
