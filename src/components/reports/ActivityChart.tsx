import type { Bucket } from "@/server/reports";

/** Calls per hour, day or month as columns; the darker part is conversations (connects). */
export function ActivityChart({ buckets, unit }: { buckets: Bucket[]; unit: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.calls));
  if (!buckets.some((b) => b.calls)) return <p className="text-sm text-muted">No calls in this period.</p>;
  const every = Math.ceil(buckets.length / 12);
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={`Calls per ${unit}`}>
        {buckets.map((b, i) => (
          <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${b.label}: ${b.calls} calls, ${b.connects} conversations`}>
            <div className="relative w-full rounded-t-[3px] bg-brand/25" style={{ height: `${(b.calls / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-brand" style={{ height: b.calls ? `${(b.connects / b.calls) * 100}%` : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-subtle">
        {buckets.map((b, i) => (
          <div key={i} className="min-w-0 flex-1 truncate text-center">{i % every === 0 ? b.label : ""}</div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand/25" /> Calls</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" /> Conversations</span>
      </div>
    </div>
  );
}
