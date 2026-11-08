"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setTimeView } from "@/app/actions/profile";
import { TIME_VIEW_LABEL, type TimeView } from "@/lib/time";
import { cn } from "./ui";

/**
 * USA / Pakistan switch for every time in the app. USA (the shop's own time) is the
 * default; the choice is kept in a cookie so the server renders every page in it.
 */
export function TimeViewToggle({ view }: { view: TimeView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function pick(v: TimeView) {
    if (v === view) return;
    start(async () => {
      await setTimeView(v);
      router.refresh();
    });
  }
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs", pending && "opacity-60")} role="radiogroup" aria-label="Show times in" data-testid="time-view">
      {(["usa", "pk"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          title={`Show times in ${TIME_VIEW_LABEL[v]}`}
          onClick={() => pick(v)}
          className={cn("rounded-md px-2 py-1 font-medium transition", view === v ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-muted hover:text-fg")}
        >
          {v === "usa" ? "USA" : "PK"}
        </button>
      ))}
    </div>
  );
}
