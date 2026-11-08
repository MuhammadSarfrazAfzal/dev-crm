/**
 * Single-series horizontal bars: one hue for magnitude, value printed in text ink beside
 * each bar, and the label/value pair doubles as the table view. Hover shows the exact share.
 */
export function BarList({ rows, total, emptyText = "No data yet." }: { rows: { label: string; value: number; hint?: string }[]; total?: number; emptyText?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length || sum === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => {
          const share = sum ? Math.round((r.value / sum) * 100) : 0;
          return (
            <tr key={r.label} className="group" title={`${r.label}: ${r.value} (${share}%)`}>
              <th scope="row" className="w-40 py-1 pr-3 text-left font-normal whitespace-nowrap text-muted">{r.label}</th>
              <td className="py-1">
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 rounded-r-sm bg-surface-3">
                    <div className="h-3 rounded-r-[4px] bg-brand transition-[width] group-hover:bg-brand-strong" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right text-fg tabular-nums">{r.value}<span className="ml-1 text-xs text-subtle">{share}%</span></span>
                </div>
                {r.hint && <div className="text-xs text-subtle">{r.hint}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
