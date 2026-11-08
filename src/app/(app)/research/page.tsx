import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { cancelResearchRequest } from "@/app/actions/research";
import { Icon, type IconName } from "@/components/icons";
import { ResearchSetup } from "@/components/research/ResearchSetup";
import { ResultsPreview } from "@/components/research/ResultsPreview";
import { Badge, Card, PageHeader } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { relativeTime } from "@/lib/format";
import { getResearchProvider, RESEARCH_PROVIDERS } from "@/lib/research/providers";
import { RESEARCH_FIELD_LABEL, type ResearchField } from "@/lib/research/types";
import { listResearchRequests } from "@/server/research";

export const metadata: Metadata = { title: "Research agent" };

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "search", title: "Agent searches", text: "Looks up businesses on the public web: their sites, maps and directories." },
  { icon: "file", title: "Rows come back", text: "Name, phones, emails, contact, address and the page each value came from." },
  { icon: "check", title: "You review", text: "Same preview as a file import: duplicates flagged, nothing saved until you approve." },
];

const STATUS: Record<string, { label: string; tone: "slate" | "amber" | "sky" | "green" | "red" }> = {
  waiting_for_provider: { label: "Waiting for agent", tone: "amber" },
  queued: { label: "Queued", tone: "sky" },
  running: { label: "Running", tone: "sky" },
  done: { label: "Done", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export default async function ResearchPage() {
  // Switched off for now (see lib/features); leads come in through Import.
  if (!FEATURES.researchAgent) notFound();
  const { requests } = await withUserDb(async (tx) => ({ requests: await listResearchRequests(tx) }));
  const providers = RESEARCH_PROVIDERS.map(({ id, label, vendor, description, enabled }) => ({ id, label, vendor, description, enabled }));
  const connected = providers.some((p) => p.enabled);

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Research agent"
        subtitle="Collect phone numbers, emails, names and addresses for businesses from the web, then review them like any import."
        actions={<Badge tone={connected ? "green" : "amber"} dot>{connected ? "Connected" : "Not connected yet"}</Badge>}
      />

      {!connected && (
        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-line bg-gradient-to-r from-brand-soft via-surface to-surface p-5 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><Icon name="plug" className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-fg">Setup only: no agent is connected</div>
            <p className="mt-0.5 text-sm text-muted">
              You can plan requests now. Connecting an agent (Codex, Claude, Gemini or your own) comes after the rest of the CRM is finished. Until then nothing is
              searched, no keys are stored and no data leaves this app.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ResearchSetup providers={providers} />

        <aside className="space-y-6">
          <Card title="How it works">
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted"><Icon name={s.icon} /></span>
                  <div>
                    <div className="text-sm font-medium text-fg">{i + 1}. {s.title}</div>
                    <p className="text-xs text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Saved requests" description="They run when an agent is connected.">
            {requests.length === 0 ? (
              <p className="text-sm text-muted">No requests yet.</p>
            ) : (
              <ul className="-my-2 divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-fg" title={r.query}>{r.query}</div>
                        <div className="mt-0.5 truncate text-xs text-muted">
                          {[r.location, getResearchProvider(r.provider)?.label, relativeTime(r.created_at)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Badge tone={STATUS[r.status]?.tone ?? "slate"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {r.fields.map((f) => <Badge key={f}>{RESEARCH_FIELD_LABEL[f as ResearchField]?.label ?? f}</Badge>)}
                    </div>
                    {r.status === "waiting_for_provider" && (
                      <form action={cancelResearchRequest} className="mt-2">
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs font-medium text-muted hover:text-danger-fg">Cancel request</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <div className="mt-6">
        <ResultsPreview />
      </div>
    </>
  );
}
