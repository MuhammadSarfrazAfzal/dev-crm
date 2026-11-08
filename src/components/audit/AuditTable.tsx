"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState } from "@/components/ui";
import { AuditActionBadge } from "./AuditActionBadge";
import { AuditDetailsModal, type AuditLogItem } from "./AuditDetailsModal";

export function AuditTable({ logs }: { logs: AuditLogItem[] }) {
  const [activeLog, setActiveLog] = useState<AuditLogItem | null>(null);

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No audit logs found"
      >
        No activity matches your current filters. Try selecting another action or clearing the search.
      </EmptyState>
    );
  }

  return (
    <>
      {/* Mobile Card List */}
      <ul className="divide-y divide-line md:hidden">
        {logs.map((log) => {
          return (
            <li
              key={log.id}
              onClick={() => setActiveLog(log)}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-surface-2/60 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <AuditActionBadge action={log.action} />
                <span className="shrink-0 text-xs text-muted tabular-nums" title={log.formatted_time}>
                  {log.relative_time}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-fg-2 pt-1 border-t border-line/60">
                <div className="flex items-center gap-1.5 min-w-0">
                  {log.actor ? (
                    <>
                      <Avatar name={log.actor} className="size-4 text-[9px]" />
                      <span className="truncate font-medium">{log.actor}</span>
                    </>
                  ) : (
                    <span className="text-subtle">System</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {log.entity && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-muted capitalize">
                      {log.entity}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveLog(log);
                    }}
                    className="btn-ghost btn-xs text-brand-fg hover:bg-brand-soft"
                  >
                    View details
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop Fixed Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full table-fixed text-sm" data-testid="audit-table">
          <colgroup>
            <col className="w-[12.5rem]" />
            <col className="w-[11.5rem]" />
            <col className="w-[14.5rem]" />
            <col className="w-[11rem]" />
            <col />
            <col className="w-[5.5rem]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs font-medium text-muted [&>th]:sticky [&>th]:top-[53px] [&>th]:z-10 [&>th]:border-b [&>th]:border-line [&>th]:bg-surface-2/95 [&>th]:px-3 [&>th]:py-2.5 [&>th]:backdrop-blur lg:[&>th]:top-0">
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target Record</th>
              <th>Summary / Details</th>
              <th className="text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((log) => {
              const d = log.details;
              const hasDetails = d && typeof d === "object" && Object.keys(d).length > 0;

              return (
                <tr
                  key={log.id}
                  onClick={() => setActiveLog(log)}
                  className="group cursor-pointer align-middle transition-colors hover:bg-surface-2/70 [&>td]:px-3 [&>td]:py-2.5"
                >
                  {/* Timestamp */}
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-medium text-fg tabular-nums">
                      <Icon name="clock" className="size-3.5 text-muted shrink-0" />
                      <span>{log.relative_time}</span>
                    </div>
                    <div className="text-xs text-muted tabular-nums pl-5" title={log.formatted_time}>
                      {log.formatted_time}
                    </div>
                  </td>

                  {/* Actor */}
                  <td className="min-w-0">
                    {log.actor ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={log.actor} className="size-6 text-[10px]" />
                        <span className="truncate font-medium text-fg" title={log.actor}>
                          {log.actor}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-subtle">
                        <Icon name="monitor" className="size-3" /> System
                      </span>
                    )}
                  </td>

                  {/* Action Badge */}
                  <td>
                    <AuditActionBadge action={log.action} />
                  </td>

                  {/* Target Record */}
                  <td className="min-w-0" onClick={(e) => log.entity_id && e.stopPropagation()}>
                    {log.entity === "leads" && log.entity_id ? (
                      <Link
                        href={`/leads/${log.entity_id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-fg hover:underline truncate"
                        title={`View Lead ${log.entity_id}`}
                      >
                        <Icon name="leads" className="size-3.5 shrink-0" />
                        <span className="truncate">Lead #{log.entity_id.slice(0, 8)}</span>
                      </Link>
                    ) : log.entity === "imports" && log.entity_id ? (
                      <Link
                        href={`/imports/${log.entity_id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-fg hover:underline truncate"
                        title={`View Import ${log.entity_id}`}
                      >
                        <Icon name="upload" className="size-3.5 shrink-0" />
                        <span className="truncate">Import #{log.entity_id.slice(0, 8)}</span>
                      </Link>
                    ) : log.entity === "companies" && log.entity_id ? (
                      <Link
                        href={`/companies/${log.entity_id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-fg hover:underline truncate"
                        title={`View Company ${log.entity_id}`}
                      >
                        <Icon name="companies" className="size-3.5 shrink-0" />
                        <span className="truncate">Company #{log.entity_id.slice(0, 8)}</span>
                      </Link>
                    ) : log.entity === "profiles" ? (
                      <Link
                        href="/team"
                        className="inline-flex items-center gap-1 font-medium text-brand-fg hover:underline truncate"
                      >
                        <Icon name="team" className="size-3.5 shrink-0" />
                        <span>Team Profile</span>
                      </Link>
                    ) : log.entity ? (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-muted capitalize">
                        {log.entity}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>

                  {/* Summary / Details Preview */}
                  <td className="min-w-0">
                    {hasDetails ? (
                      <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
                        {"count" in d && (
                          <span className="inline-flex items-center rounded bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-fg tabular-nums">
                            count: {String(d.count)}
                          </span>
                        )}
                        {"filename" in d && (
                          <span className="inline-flex max-w-[12rem] items-center truncate rounded bg-surface-3 px-1.5 py-0.5 text-xs text-fg-2" title={String(d.filename)}>
                            file: {String(d.filename)}
                          </span>
                        )}
                        {"email" in d && (
                          <span className="inline-flex max-w-[12rem] items-center truncate rounded bg-surface-3 px-1.5 py-0.5 text-xs text-fg-2" title={String(d.email)}>
                            {String(d.email)}
                          </span>
                        )}
                        {"role" in d && (
                          <span className="inline-flex items-center rounded bg-surface-3 px-1.5 py-0.5 text-xs capitalize text-fg-2">
                            {String(d.role)}
                          </span>
                        )}
                        {"provider" in d && (
                          <span className="inline-flex items-center rounded bg-surface-3 px-1.5 py-0.5 text-xs text-fg-2">
                            {String(d.provider)}
                          </span>
                        )}
                        {"total" in d && (
                          <span className="inline-flex items-center rounded bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-fg tabular-nums">
                            total: {String(d.total)}
                          </span>
                        )}
                        <span className="text-xs text-muted group-hover:text-brand-fg transition-colors">
                          · View details →
                        </span>
                      </div>
                    ) : (
                      <span className="text-subtle text-xs">No extra metadata</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveLog(log);
                      }}
                      className="btn-ghost btn-xs text-brand-fg hover:bg-brand-soft"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      <AuditDetailsModal log={activeLog} onClose={() => setActiveLog(null)} />
    </>
  );
}
