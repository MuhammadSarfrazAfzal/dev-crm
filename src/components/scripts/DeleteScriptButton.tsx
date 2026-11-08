"use client";

import { useActionState, useState } from "react";
import { deleteScript } from "@/app/actions/scripts";
import type { ActionState } from "@/app/actions/lead";
import { Icon } from "@/components/icons";

export function DeleteScriptButton({
  scriptKey,
  title,
  variant = "button",
}: {
  scriptKey: string;
  title: string;
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteScript, {});

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted transition hover:border-danger-line hover:bg-danger-soft hover:text-danger-fg"
          title={`Delete ${title}`}
          aria-label={`Delete ${title}`}
        >
          <Icon name="trash" className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost inline-flex items-center gap-1.5 border border-line text-xs font-medium text-danger-fg hover:border-danger-line hover:bg-danger-soft"
          title="Delete this script"
        >
          <Icon name="trash" className="size-3.5" />
          Delete script
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="card w-full max-w-md p-6 shadow-pop animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-fg">
                <Icon name="trash" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-fg">Delete script?</h3>
                <p className="mt-1 text-sm text-muted">
                  Are you sure you want to delete <span className="font-semibold text-fg">{title}</span>? All versions of this script will be permanently removed.
                </p>
                {state.error && (
                  <p className="mt-2 text-xs font-medium text-danger-fg">{state.error}</p>
                )}
              </div>
            </div>

            <form action={action} className="mt-6 flex items-center justify-end gap-2">
              <input type="hidden" name="scriptKey" value={scriptKey} />
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary inline-flex items-center gap-1.5 bg-danger text-xs hover:bg-danger-strong"
              >
                <Icon name="trash" className="size-3.5" />
                {pending ? "Deleting…" : "Delete script"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
