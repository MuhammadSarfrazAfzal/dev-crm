"use client";

import { startTransition, useActionState } from "react";
import { draftWithAi, publishScript } from "@/app/actions/scripts";
import type { ActionState } from "@/app/actions/lead";
import { SCRIPT_TYPE_LABEL, SCRIPT_TYPES } from "@/lib/labels";
import { Icon } from "./icons";
import { Dropdown } from "./menu/Dropdown";
import { FormStatus } from "./lead/FormStatus";

type Initial = { scriptKey?: string; product?: string | null; scriptType?: string; title?: string; body?: string };

export function ScriptEditor({ initial, aiEnabled, aiReason }: { initial: Initial; aiEnabled: boolean; aiReason: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(publishScript, {});
  const [aiState, aiAction, aiPending] = useActionState<ActionState>(draftWithAi, {});
  const isNew = !initial.scriptKey;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="scriptKey" value={initial.scriptKey ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-product">For</label>
          <Dropdown id="s-product" name="product" defaultValue={initial.product ?? ""} options={[{ value: "", label: "Both products" }, { value: "pos", label: "8staros POS only" }, { value: "wholesale", label: "Wholesale only" }]} />
        </div>
        <div>
          <label className="label" htmlFor="s-type">Type</label>
          <Dropdown id="s-type" name="scriptType" defaultValue={initial.scriptType ?? "opening"} options={SCRIPT_TYPES.map((t) => ({ value: t, label: SCRIPT_TYPE_LABEL[t] }))} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="s-title">Title</label>
        <input id="s-title" name="title" required maxLength={200} defaultValue={initial.title} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="s-body">Script</label>
        <textarea id="s-body" name="body" required rows={12} maxLength={20000} defaultValue={initial.body} className="input font-mono text-sm" />
        <p className="mt-1.5 text-xs text-muted">Placeholders: <code className="kbd">{"{{rep_name}}"}</code> <code className="kbd">{"{{contact_name}}"}</code> <code className="kbd">{"{{company}}"}</code></p>
      </div>
      {!isNew && (
        <div>
          <label className="label" htmlFor="s-note">What changed?</label>
          <input id="s-note" name="changeNote" maxLength={300} className="input" placeholder="e.g. Shorter opening, new objection answer" />
        </div>
      )}
      <FormStatus state={state} />
      <FormStatus state={aiState} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Publishing…" : isNew ? "Publish script" : "Publish new version"}</button>
        <button type="button" disabled={!aiEnabled || aiPending} title={aiEnabled ? "Draft with AI" : aiReason} onClick={() => startTransition(() => aiAction())} className="btn-secondary">
          <Icon name="sparkles" /> Draft with AI {aiEnabled ? "" : "(not connected)"}
        </button>
      </div>
    </form>
  );
}
