"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { deleteRecords } from "@/app/actions/delete";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./icons";
import { cn } from "./ui";

const ATTACHED = "calls, follow-ups, emails, deals, notes, contacts and files";

/**
 * Delete with a clear confirm step. `ids` can be fixed, or read when clicked (the ticked
 * rows of a form). After deleting, the page refreshes or goes to `after`.
 */
export function DeleteButton({
  kind,
  ids,
  getIds,
  name,
  after,
  variant = "button",
  className,
  testId,
}: {
  kind: "leads" | "companies";
  ids?: string[];
  getIds?: () => string[];
  /** The shop's name, for a single delete. */
  name?: string;
  after?: string;
  variant?: "button" | "bar";
  className?: string;
  testId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => setChosen(null), []);

  function open(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const list = ids ?? getIds?.() ?? [];
    if (!list.length) return;
    setError(null);
    setChosen(list);
  }

  function confirm() {
    if (!chosen) return;
    start(async () => {
      const res = await deleteRecords({ kind, ids: chosen });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setChosen(null);
      if (after) router.push(after);
      else router.refresh();
    });
  }

  const n = chosen?.length ?? 0;
  const noun = kind === "leads" ? "lead" : "company";
  const title = n === 1 && name ? `Delete ${name}?` : `Delete ${n} ${noun}${n === 1 ? "" : kind === "leads" ? "s" : ""}`.replace("companys", "companies") + "?";

  return (
    <>
      <button type="button" onClick={open} data-testid={testId} className={cn(variant === "bar" ? "btn-ghost btn-sm text-danger-fg hover:bg-danger-soft" : "btn-danger", className)}>
        <Icon name="trash" className="size-3.5" /> Delete{variant === "button" ? ` ${kind === "leads" ? "lead" : "company"}` : ""}
      </button>
      {chosen && (
        <ConfirmDialog
          testId="delete-dialog"
          tone="danger"
          icon="trash"
          title={title}
          body={<>This removes {n === 1 ? "the shop with its" : "these shops with their"} {ATTACHED}. Reports, the dashboard and follow-ups update. It can&apos;t be undone.</>}
          confirmLabel={n === 1 ? `Delete ${noun}` : `Delete ${n}`}
          pending={pending}
          error={error}
          onConfirm={confirm}
          onCancel={close}
        />
      )}
    </>
  );
}
