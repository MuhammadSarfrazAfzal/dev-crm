import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { ScriptEditor } from "@/components/ScriptEditor";
import { Icon } from "@/components/icons";
import { SCRIPT_TYPE_ICON, ScriptText } from "@/components/ScriptText";
import { DeleteScriptButton } from "@/components/scripts/DeleteScriptButton";
import { Alert, Badge, Card, PageHeader, ProductBadge } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { getScriptDrafter } from "@/lib/ai/script-drafter";
import { formatInZone } from "@/lib/time";
import { SCRIPT_TYPE_LABEL, type Product, type ScriptType } from "@/lib/labels";

export const metadata: Metadata = { title: "Script" };

export default async function ScriptPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ msg?: string; v?: string }> }) {
  const { key } = await params;
  const { msg, v } = await searchParams;
  if (!/^[a-z0-9-]{3,80}$/.test(key)) notFound();
  const drafter = getScriptDrafter();

  if (key === "new") {
    const { user } = await withUserDb(async (_tx, user) => ({ user }));
    if (user.role !== "admin") notFound();
    return (
      <>
        <PageHeader back={{ href: "/scripts", label: "Scripts" }} title="New script" subtitle="Write it the way you'd say it. Use placeholders for names; they fill in on each lead." />
        <div className="max-w-3xl"><Card><ScriptEditor initial={{}} aiEnabled={drafter.enabled} aiReason={drafter.reason} /></Card></div>
      </>
    );
  }

  const { user, versions } = await withUserDb(async (tx, user) => ({
    user,
    versions: await tx`select s.id, s.version, s.product::text as product, s.script_type, s.title, s.body, s.is_current, s.change_note, s.created_at, p.full_name as author
      from scripts s left join profiles p on p.id = s.created_by where s.script_key = ${key} order by s.version desc`,
  }));
  if (!versions.length) notFound();
  const current = versions.find((s) => s.is_current) ?? versions[0];
  const shown = versions.find((s) => String(s.version) === v) ?? current;

  return (
    <>
      <PageHeader
        back={{ href: "/scripts", label: "Scripts" }}
        eyebrow={SCRIPT_TYPE_LABEL[current.script_type as ScriptType]}
        title={current.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><ProductBadge product={current.product as Product | null} /> Version {current.version} · {versions.length} version{versions.length === 1 ? "" : "s"}</span>}
        actions={
          <div className="flex items-center gap-2">
            <CopyButton text={shown.body} label="Copy script" className="btn-secondary" />
            {user.role === "admin" && <DeleteScriptButton scriptKey={key} title={current.title} />}
          </div>
        }
      />
      {msg === "published" && <div className="mb-4"><Alert tone="green">Published. Salespeople see the new version right away.</Alert></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card title={<>Version {shown.version}{shown.is_current ? "" : " (older version)"}</>} icon={SCRIPT_TYPE_ICON[current.script_type as ScriptType]} actions={shown.is_current ? <Badge tone="green" dot>Current</Badge> : <Link href={`/scripts/${key}`} className="link text-xs">Show current</Link>}>
            <ScriptText body={shown.body} className="max-w-prose text-[15px] leading-7 whitespace-pre-wrap text-fg" />
          </Card>
          {user.role === "admin" && (
            <details className="card" open={false}>
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="edit" className="size-4 text-muted" /> Edit script</span>
                <span className="text-xs text-muted">Saving publishes a new version; old ones are kept</span>
              </summary>
              <div className="border-t border-line p-5">
                <ScriptEditor
                  key={current.id}
                  initial={{ scriptKey: key, product: current.product, scriptType: current.script_type, title: current.title, body: current.body }}
                  aiEnabled={drafter.enabled}
                  aiReason={drafter.reason}
                />
              </div>
            </details>
          )}
        </div>
        <Card title="History" icon="history" className="self-start">
          <ol className="relative space-y-4 border-l border-line pl-5 text-sm">
            {versions.map((sv) => (
              <li key={sv.id} className="relative">
                <span className={`absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${sv.version === shown.version ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
                <div className="flex items-center gap-1.5">
                  <Link href={`/scripts/${key}?v=${sv.version}`} className={`font-medium ${sv.version === shown.version ? "text-brand-fg" : "text-fg hover:text-brand-fg"}`}>Version {sv.version}</Link>
                  {sv.is_current && <Badge tone="green">current</Badge>}
                </div>
                <div className="text-xs text-muted">{formatInZone(sv.created_at, user.timeZone)} · {sv.author ?? "system"}</div>
                {sv.change_note && <div className="mt-0.5 text-xs text-fg-2">{sv.change_note}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
