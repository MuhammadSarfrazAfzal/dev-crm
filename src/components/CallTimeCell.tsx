import { callingWindow } from "@/lib/time";
import { Badge } from "./ui";

/** The shop's local time now and whether it's a good time to call. */
export function CallTimeCell({ timeZone, state }: { timeZone: string | null; state: string | null }) {
  const w = callingWindow(timeZone, state);
  if (w.status === "unknown_zone") return <span className="text-xs text-subtle">Time zone unknown</span>;
  const time = w.localTime.replace(/^\w+\s/, "");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap tabular-nums text-fg-2">{time} {w.zone}</span>
      {w.status === "ok" ? <Badge tone="green" dot>OK to call</Badge> : w.status === "outside_house" ? <Badge tone="amber" dot title={w.message}>Off hours</Badge> : <Badge tone="red" dot title={w.message}>Don&apos;t call now</Badge>}
    </span>
  );
}
