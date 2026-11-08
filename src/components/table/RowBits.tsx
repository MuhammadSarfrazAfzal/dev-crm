import { relativeTime } from "@/lib/format";

/** Small, quiet label used inside table rows. */
export function Pill({ children, tone, title, shrink }: { children: React.ReactNode; tone?: "violet" | "amber" | "red" | "sky" | "green"; title?: string; shrink?: boolean }) {
  const cls = { violet: "bg-accent-soft text-accent-fg", amber: "bg-warning-soft text-warning-fg", red: "bg-danger-soft text-danger-fg", sky: "bg-info-soft text-info-fg", green: "bg-success-soft text-success-fg" }[tone ?? "violet"];
  return (
    <span title={title} className={`inline-block rounded px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap ${shrink ? "min-w-0 truncate" : "shrink-0"} ${tone ? cls : "bg-surface-3 text-muted"}`}>
      {children}
    </span>
  );
}

/** "24 min ago", "in 3 hr": relative time short enough for a table cell. */
export function shortAgo(date: Date | string) {
  return relativeTime(date).replace(/ minutes?/, " min").replace(/ hours?/, " hr").replace(/ seconds?/, " sec").replace(/ days?/, " d").replace(/ weeks?/, " wk").replace(/ months?/, " mo");
}

/** Empty value: a soft dash. */
export const Soft = () => <span className="text-subtle" aria-label="Not listed">—</span>;

/** Compact product pills for a row: what the shop wants, with a tick once bought. */
export function ProductPills({ interested, bought }: { interested: readonly string[]; bought: readonly string[] }) {
  return (
    <>
      {(["pos", "wholesale"] as const).filter((p) => interested.includes(p) || bought.includes(p)).map((p) => {
        const name = p === "pos" ? "POS" : "Wholesale";
        return bought.includes(p)
          ? <Pill key={p} tone="green" title={`Bought ${p === "pos" ? "8staros POS" : "wholesale"}`}>✓ {name}</Pill>
          : <Pill key={p} tone={p === "pos" ? "violet" : "amber"} title={`Interested in ${p === "pos" ? "8staros POS" : "wholesale"}`}>{name}</Pill>;
      })}
    </>
  );
}
