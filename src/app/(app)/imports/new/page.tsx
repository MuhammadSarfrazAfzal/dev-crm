import type { Metadata } from "next";
import { ImportForm } from "@/components/ImportForm";
import { Icon, type IconName } from "@/components/icons";
import { Alert, Card, PageHeader } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { ACCEPT } from "@/lib/import/sniff";
import { listOwners } from "@/server/leads";

export const metadata: Metadata = { title: "New import" };

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "upload", title: "Upload", text: "Any list: spreadsheets, PDFs, Word files, photos or pasted text." },
  { icon: "file", title: "Check the rows", text: "Company, contact, phone, email, address, city, state, ZIP, website, source and area, each in its own column." },
  { icon: "check", title: "Approve", text: "Only the rows you keep become leads. Duplicates are skipped." },
];

export default async function NewImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { user, owners } = await withUserDb(async (tx, user) => ({ user, owners: user.role === "admin" ? await listOwners(tx) : [] }));
  return (
    <>
      <PageHeader back={{ href: "/imports", label: "Imports" }} title="Import leads" subtitle="Upload a list or paste one. You'll check every row before anything is saved." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <Card>
            <ImportForm accept={ACCEPT} owners={owners} isAdmin={user.role === "admin"} userId={user.id} />
          </Card>
        </div>
        <aside className="space-y-4">
          <Card title="How importing works">
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
          <p className="px-1 text-xs text-muted">
            Only import businesses you may contact. Shops on the internal do-not-call list stay blocked. Files are read on this server; nothing is sent to an AI service.
          </p>
        </aside>
      </div>
    </>
  );
}
