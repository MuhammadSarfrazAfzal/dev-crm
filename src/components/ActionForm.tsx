"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/app/actions/lead";
import { FormStatus } from "./lead/FormStatus";

/** A form bound to a server action that shows the result and resets after a successful save. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "space-y-3",
  reset = true,
  submitClassName = "btn-primary",
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  reset?: boolean;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form key={reset ? (state.savedAt ?? 0) : undefined} action={formAction} className={className}>
      {children}
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className={submitClassName}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
