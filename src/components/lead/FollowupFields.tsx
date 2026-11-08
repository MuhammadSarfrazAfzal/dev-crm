"use client";

import { useMemo, useState } from "react";
import { callingWindow, followupQuickPicks, formatInZone, isValidTimeZone, PAKISTAN_TZ, toLocalInput, withinLegalWindow, zonedToUtc, type TimeView } from "@/lib/time";
import { cn } from "../ui";
import { Dropdown } from "../menu/Dropdown";

/**
 * Follow-up time picker. The time is typed as wall-clock time in the shop's own USA zone
 * or in Pakistan time, and sent with that zone, so the server converts it exactly once and
 * every page shows the same instant. The preview always shows both clocks.
 */
export function FollowupFields({
  leadTz,
  leadState,
  view,
  usTz,
  needsConfirm,
  defaultKind = "call",
  idPrefix,
  kindName = "kind",
}: {
  leadTz: string | null;
  leadState: string | null;
  /** The app-wide USA / Pakistan choice; the picker starts in the same clock. */
  view: TimeView;
  /** The user's USA zone, used when the shop's zone is unknown. */
  usTz: string;
  needsConfirm?: boolean;
  defaultKind?: "call" | "email" | "task";
  idPrefix: string;
  kindName?: string;
}) {
  const shopTz = isValidTimeZone(leadTz) ? leadTz : null;
  const usaTz = shopTz ?? usTz;
  const [zoneMode, setZoneMode] = useState<"usa" | "pk">(view);
  const tz = zoneMode === "pk" ? PAKISTAN_TZ : usaTz;
  // Quick picks are the shop's business hours ("next business day 10 am" at the shop).
  const picks = useMemo(() => followupQuickPicks(usaTz), [usaTz]);
  const [value, setValue] = useState(() => toLocalInput(picks[1].at, tz));
  const [kind, setKind] = useState(defaultKind);

  let due: Date | null = null;
  try {
    due = value ? zonedToUtc(value, tz) : null;
  } catch {
    due = null;
  }
  const outsideLegal = !!(due && shopTz && kind === "call" && !withinLegalWindow(due, shopTz, leadState));
  const outsideHouse = !!(due && shopTz && kind === "call" && callingWindow(shopTz, leadState, due).status === "outside_house");

  function switchZone(mode: "usa" | "pk") {
    // Keep the same instant while changing which clock the input shows.
    const nextTz = mode === "pk" ? PAKISTAN_TZ : usaTz;
    if (due) setValue(toLocalInput(due, nextTz));
    setZoneMode(mode);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="dueTz" value={tz} />
      <div className="flex flex-wrap gap-1.5">
        {picks.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setValue(toLocalInput(p.at, tz))}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", due && Math.abs(due.getTime() - p.at.getTime()) < 60_000 ? "border-brand bg-brand-soft text-brand-fg" : "border-line-strong text-muted hover:bg-surface-2")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor={`${idPrefix}-due`}>Date and time ({zoneMode === "pk" ? "Pakistan time" : shopTz ? "USA · shop's time" : "USA time"})</label>
          <input id={`${idPrefix}-due`} name="dueLocal" type="datetime-local" required value={value} onChange={(e) => setValue(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-kind`}>Type</label>
          <Dropdown
            id={`${idPrefix}-kind`}
            name={kindName}
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            options={[{ value: "call", label: "Call back" }, { value: "email", label: "Send email" }, { value: "task", label: "Other task" }]}
          />
        </div>
      </div>
      <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="radiogroup" aria-label="Clock for the time above">
        {(["usa", "pk"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={zoneMode === m} onClick={() => switchZone(m)} className={cn("rounded-md px-2.5 py-1 font-medium", zoneMode === m ? "bg-ink text-on-ink" : "text-muted")}>
            {m === "usa" ? (shopTz ? "USA · shop's time" : "USA time") : "Pakistan time"}
          </button>
        ))}
      </div>
      {due && (
        <p className="text-xs text-muted" data-testid="followup-preview">
          {shopTz ? "Shop" : "USA"}: <strong>{formatInZone(due, usaTz)}</strong> · Pakistan: <strong>{formatInZone(due, PAKISTAN_TZ)}</strong>
        </p>
      )}
      {outsideLegal && <p className="text-xs font-medium text-danger-fg">Outside legal calling hours for this shop.</p>}
      {!outsideLegal && outsideHouse && <p className="text-xs text-warning-fg">Legal, but outside our weekday 9 am–6 pm house rule.</p>}
      {(outsideLegal || needsConfirm) && (
        <label className="flex items-center gap-2 text-xs text-fg-2">
          <input type="checkbox" name="confirmOutside" className="size-4 rounded border-line-strong" /> Schedule anyway (e.g. the shop asked for this time)
        </label>
      )}
    </div>
  );
}
