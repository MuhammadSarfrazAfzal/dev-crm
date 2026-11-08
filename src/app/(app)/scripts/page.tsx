import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SCRIPT_TYPE_ICON } from "@/components/ScriptText";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { ScriptsGrid, type ScriptCardData } from "@/components/scripts/ScriptsGrid";
import { withUserDb } from "@/lib/auth/current";
import { SCRIPT_TYPE_LABEL, SCRIPT_TYPES, type ScriptType } from "@/lib/labels";

export const metadata: Metadata = { title: "Scripts" };

const SCRIPT_TYPE_HINT: Record<ScriptType, string> = {
  opening: "First 30 seconds with the owner",
  gatekeeper: "Getting past the front desk",
  voicemail: "Short message that gets a call back",
  objection: "Answers to common push-back",
  closing: "Asking for the next step",
  follow_up_email: "What to send after the call",
};

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const type = SCRIPT_TYPES.includes(sp.type as ScriptType) ? (sp.type as ScriptType) : null;
  const msg = sp.msg;
  const { user, scripts, counts } = await withUserDb(async (tx, user) => ({
    user,
    scripts: await tx`select s.script_key, s.version, s.product::text as product, s.script_type, s.title, s.body, s.created_at,
        (select count(*)::int from scripts v where v.script_key = s.script_key) as versions
      from scripts s
      where s.is_current
        and (${type}::script_type is null or s.script_type = ${type}::script_type)
      order by array_position(array['opening','gatekeeper','voicemail','objection','closing','follow_up_email']::script_type[], s.script_type), s.product nulls first, s.title`,
    counts: await tx`select script_type, count(*)::int as n from scripts
      where is_current group by script_type`,
  }));
  const countOf = (t: ScriptType) => counts.find((c) => c.script_type === t)?.n ?? 0;
  const total = counts.reduce((s, c) => s + c.n, 0);
  const link = (t: ScriptType | null) => {
    const q = new URLSearchParams(Object.entries({ type: t ?? undefined }).filter(([, v]) => v) as [string, string][]).toString();
    return `/scripts${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Scripts"
        subtitle="What to say on every step of a call. Every shop hears about both 8staros POS and wholesale; open a script on a lead's page and the names fill in."
        actions={
          <>
            {user.role === "admin" && <Link href="/scripts/new" className="btn-primary"><Icon name="plus" /> New script</Link>}
          </>
        }
      />

      {msg === "deleted" && (
        <div className="mb-4">
          <Alert tone="green">Script deleted successfully.</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Script types" className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 hidden px-1 text-[11px] font-medium tracking-wider text-subtle uppercase lg:block">Call flow</div>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            <li>
              <Link href={link(null)} aria-current={type === null ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${type === null ? "bg-brand-soft text-brand-fg" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>
                <Icon name="script" className="size-4 shrink-0" /> <span className="flex-1">All scripts</span> <span className="text-xs tabular-nums">{total}</span>
              </Link>
            </li>
            {SCRIPT_TYPES.map((t, i) => (
              <li key={t}>
                <Link href={link(t)} aria-current={type === t ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${type === t ? "bg-brand-soft text-brand-fg" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>
                  <span className="hidden size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted lg:flex">{i + 1}</span>
                  <span className="flex-1">{SCRIPT_TYPE_LABEL[t]}</span> <span className="text-xs tabular-nums">{countOf(t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {type && (
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-fg"><Icon name={SCRIPT_TYPE_ICON[type]} /></span>
              <div>
                <h2 className="text-base font-semibold text-fg">{SCRIPT_TYPE_LABEL[type]}</h2>
                <p className="text-xs text-muted">{SCRIPT_TYPE_HINT[type]}</p>
              </div>
            </div>
          )}
          {scripts.length === 0 ? (
            <EmptyState icon="script" title="No scripts here yet" action={user.role === "admin" ? <Link href="/scripts/new" className="btn-primary">Write one</Link> : undefined}>
              {user.role === "admin" ? "Write the first one for this step." : "Ask an admin to add one."}
            </EmptyState>
          ) : (
            <ScriptsGrid
              scripts={scripts as unknown as ScriptCardData[]}
              canDelete={user.role === "admin"}
            />
          )}
          <p className="mt-6 flex items-center gap-2 text-xs text-muted">
            <Icon name="info" className="size-3.5" /> Highlighted words such as <span className="rounded bg-brand-soft px-1 text-brand-fg">contact&apos;s name</span> are filled in automatically on a lead&apos;s page.
          </p>
        </div>
      </div>
    </>
  );
}
