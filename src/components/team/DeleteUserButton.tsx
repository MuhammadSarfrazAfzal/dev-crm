"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { deleteUser } from "@/app/actions/team";
import type { ActionState } from "@/app/actions/lead";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui";

export function DeleteUserButton({
  userId,
  name,
  email,
  isSelf,
  className,
}: {
  userId: string;
  name: string;
  email: string;
  isSelf?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteUser, {});

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
    }
  }, [state.ok]);

  if (isSelf) {
    return (
      <button
        type="button"
        disabled
        title="You cannot delete your own account"
        className={cn(
          "btn-ghost inline-flex items-center justify-center gap-1.5 border border-line text-xs text-muted opacity-40 cursor-not-allowed",
          className
        )}
      >
        <Icon name="trash" className="size-3.5" />
        Delete
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "btn-ghost inline-flex items-center justify-center gap-1.5 border border-danger-line bg-danger-soft/60 text-xs font-medium text-danger-fg transition hover:bg-danger-soft",
          className
        )}
        title={`Delete ${name}`}
      >
        <Icon name="trash" className="size-3.5" />
        Delete
      </button>

      {open && (
        <ConfirmDialog
          testId="delete-user-dialog"
          tone="danger"
          icon="trash"
          title={`Delete ${name}?`}
          body={
            <>
              Are you sure you want to delete <span className="font-semibold text-fg">{name}</span> ({email})?
              Their account will be permanently removed, and any assigned leads will be unassigned. This action cannot be undone.
            </>
          }
          confirmLabel={pending ? "Deleting…" : "Delete user"}
          pending={pending}
          error={state.error}
          onConfirm={() => {
            const formData = new FormData();
            formData.append("userId", userId);
            startTransition(() => {
              action(formData);
            });
          }}
          onCancel={() => !pending && setOpen(false)}
        />
      )}
    </>
  );
}
