import { Fragment } from "react";
import type { ScriptType } from "@/lib/labels";
import type { IconName } from "./icons";

export const SCRIPT_TYPE_ICON: Record<ScriptType, IconName> = {
  opening: "phone", gatekeeper: "shield", voicemail: "voicemail", objection: "users", closing: "handshake", follow_up_email: "mail",
};

const PLACEHOLDER_LABEL: Record<string, string> = { rep_name: "your name", contact_name: "contact's name", company: "shop name" };

/** Script body with {{placeholders}} shown as highlighted tokens so they stand out on a call. */
export function ScriptText({ body, className }: { body: string; className?: string }) {
  const parts = body.split(/(\{\{\s*[a-z_]+\s*\}\})/g);
  return (
    <div className={className ?? "text-sm leading-relaxed whitespace-pre-wrap text-fg-2"}>
      {parts.map((p, i) => {
        const m = p.match(/^\{\{\s*([a-z_]+)\s*\}\}$/);
        return m ? (
          <span key={i} className="rounded bg-brand-soft px-1 py-px font-medium text-brand-fg ring-1 ring-brand-line" title={`Filled in on the lead page: ${PLACEHOLDER_LABEL[m[1]] ?? m[1]}`}>
            {PLACEHOLDER_LABEL[m[1]] ?? m[1]}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </div>
  );
}
