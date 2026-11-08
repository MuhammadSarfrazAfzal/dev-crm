"use client";

import { useActionState } from "react";
import type { TimeView } from "@/lib/time";
import { scheduleFollowup, type ActionState } from "@/app/actions/lead";
import { FollowupFields } from "./FollowupFields";
import { FormStatus } from "./FormStatus";

export function ScheduleFollowupForm(props: { leadId: string; leadTz: string | null; leadState: string | null; view: TimeView; usTz: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(scheduleFollowup, {});
  return (
    <form key={state.savedAt ?? 0} action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={props.leadId} />
      <FollowupFields leadTz={props.leadTz} leadState={props.leadState} view={props.view} usTz={props.usTz} needsConfirm={state.needsConfirm} idPrefix="fu" />
      <input name="notes" maxLength={5000} className="input" placeholder="What's the follow-up about? (optional)" aria-label="Follow-up note" />
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className="btn-secondary">{pending ? "Saving…" : "Add follow-up"}</button>
    </form>
  );
}
