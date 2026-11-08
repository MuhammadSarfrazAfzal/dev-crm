"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteImport } from "@/app/actions/imports";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui";

export function DeleteImportButton({
  importId,
  filename,
  variant = "icon",
  after,
  className,
}: {
  importId: string;
  filename: string;
  variant?: "icon" | "button";
  after?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }

  function handleConfirm() {
    start(async () => {
      const res = await deleteImport(importId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (after) {
        router.push(after);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleOpen}
          title={`Delete ${filename}`}
          aria-label={`Delete ${filename}`}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger-fg",
            className
          )}
        >
          <Icon name="trash" className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "btn-danger inline-flex items-center gap-1.5",
            className
          )}
        >
          <Icon name="trash" className="size-4" />
          Delete import
        </button>
      )}

      {open && (
        <ConfirmDialog
          testId="delete-import-dialog"
          tone="danger"
          icon="trash"
          title={`Delete ${filename}?`}
          body={
            <>
              This removes the import file and review record from the imports section.{" "}
              <strong className="font-medium text-fg">
                All existing leads and companies created from this import will stay intact.
              </strong>
            </>
          }
          confirmLabel={pending ? "Deleting…" : "Delete import"}
          pending={pending}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => !pending && setOpen(false)}
        />
      )}
    </>
  );
}

