import type { Metadata } from "next";
import Link from "next/link";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { Icon } from "@/components/icons";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Imports" };

const STATUS = {
  preview: { tone: "amber", label: "Needs review" },
  approved: { tone: "green", label: "Approved" },
  rejected: { tone: "slate", label: "Discarded" },
  failed: { tone: "red", label: "Failed" },
} as const;

const SOURCE_LABEL: Record<string, string> = { csv: "CSV", xlsx: "Excel", pdf: "PDF", docx: "Word", txt: "Text", image: "Image", paste: "Pasted", zip: "ZIP", research: "Research" };

export default async function ImportsPage() {
  const { user, rows } = await withUserDb(async (tx, user) => ({
    user,
    rows: await tx`select i.id, i.source_type, i.original_filename, i.status, i.row_count, i.approved_count, i.skipped_count,
        i.created_at, i.uploaded_by, p.full_name as uploader
      from imports i left join profiles p on p.id = i.uploaded_by
      order by i.created_at desc limit 100`,
  }));
  return (
    <>
      <PageHeader
        title="Imports"
        subtitle={user.role === "admin" ? "Every list brought into the CRM, with where each lead came from" : "Lists you brought into the CRM"}
        actions={<Link href="/imports/new" className="btn-primary"><Icon name="plus" /> New import</Link>}
      />
      {rows.length === 0 ? (
        <EmptyState icon="upload" title="No imports yet" action={<Link href="/imports/new" className="btn-primary">Import a list</Link>}>
          Upload a spreadsheet, PDF, Word file or photo of a list. You review every row before anything is added.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>File</th><th>Status</th><th className="text-right">Rows</th><th className="hidden text-right md:table-cell">Added as leads</th>
                {user.role === "admin" && <th className="hidden md:table-cell">By</th>}<th>When</th>
                <th className="w-12 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status as keyof typeof STATUS];
                const filename = r.original_filename ?? (r.source_type === "research" ? "Research results" : "Pasted text");
                const canDelete = user.role === "admin" || user.id === r.uploaded_by;
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <td>
                      <Link href={`/imports/${r.id}`} className="flex items-center gap-2.5 font-medium text-fg hover:text-brand-fg">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted"><Icon name={r.source_type === "research" ? "sparkles" : "file"} /></span>
                        <span className="min-w-0">
                          <span className="block max-w-72 truncate">{filename}</span>
                          <span className="block text-xs font-normal text-muted">{SOURCE_LABEL[r.source_type] ?? r.source_type}</span>
                        </span>
                      </Link>
                    </td>
                    <td><Badge tone={st?.tone ?? "slate"} dot>{st?.label ?? r.status}</Badge></td>
                    <td className="text-right tabular-nums">{r.row_count}</td>
                    <td className="hidden text-right tabular-nums md:table-cell">
                      {r.status === "approved" ? (
                        <span>
                          {r.approved_count} added
                          {r.skipped_count > 0 && <span className="block text-xs text-muted">({r.skipped_count} skipped)</span>}
                        </span>
                      ) : "—"}
                    </td>
                    {user.role === "admin" && <td className="hidden whitespace-nowrap md:table-cell">{r.uploader}</td>}
                    <td className="whitespace-nowrap text-muted">{relativeTime(r.created_at)}</td>
                    <td className="text-right whitespace-nowrap">
                      {canDelete && (
                        <DeleteImportButton
                          importId={r.id}
                          filename={filename}
                          variant="icon"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
