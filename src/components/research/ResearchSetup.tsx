"use client";

import { useActionState, useState } from "react";
import { saveResearchRequest } from "@/app/actions/research";
import type { ActionState } from "@/app/actions/lead";
import { FormStatus } from "../lead/FormStatus";
import { Icon, type IconName } from "../icons";
import { cn } from "../ui";
import { Dropdown } from "../menu/Dropdown";
import { RESEARCH_FIELD_LABEL, RESEARCH_FIELDS, type ResearchField, type ResearchMode } from "@/lib/research/types";

type ProviderView = { id: string; label: string; vendor: string; description: string; enabled: boolean };

const MODES: { id: ResearchMode; label: string; icon: IconName; hint: string }[] = [
  { id: "area", label: "Businesses in an area", icon: "pin", hint: "e.g. phone repair shops in Houston, TX" },
  { id: "company", label: "One company", icon: "companies", hint: "Fill in the details for a shop you know" },
  { id: "website", label: "A website", icon: "globe", hint: "Read one site or directory page" },
];

const FIELD_ICON: Record<ResearchField, IconName> = { phones: "phone", emails: "mail", contacts: "user", addresses: "pin", websites: "globe", socials: "link" };

export function ResearchSetup({ providers }: { providers: ProviderView[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveResearchRequest, {});
  const [provider, setProvider] = useState(providers[0]?.id ?? "");
  const [mode, setMode] = useState<ResearchMode>("area");
  const [fields, setFields] = useState<ResearchField[]>(["phones", "emails", "contacts", "addresses"]);
  const toggle = (f: ResearchField) => setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const chosen = providers.find((p) => p.id === provider);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="mode" value={mode} />

      <Step n={1} title="Choose an AI agent" description="The agent searches the public web and reads the pages for you.">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="AI agent">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={provider === p.id}
              onClick={() => setProvider(p.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition",
                provider === p.id ? "border-brand bg-brand-soft/60 ring-3 ring-brand/15" : "border-line hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{p.label}<span className="ml-1.5 text-xs font-normal text-muted">{p.vendor}</span></span>
                <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                  <span className="size-1.5 rounded-full bg-subtle" aria-hidden /> Not connected
                </span>
              </span>
              <span className="text-xs text-muted">{p.description}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="What should it look up?">
        <div className="mb-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Research type">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                mode === m.id ? "border-brand bg-brand-soft/60" : "border-line hover:bg-surface-2",
              )}
            >
              <Icon name={m.icon} className={cn("mt-0.5 size-4 shrink-0", mode === m.id ? "text-brand-fg" : "text-subtle")} />
              <span>
                <span className="block text-sm font-medium text-fg">{m.label}</span>
                <span className="block text-xs text-muted">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={mode === "website" ? "sm:col-span-2" : ""}>
            <label className="label" htmlFor="rs-query">{mode === "website" ? "Website address" : mode === "company" ? "Company name" : "Type of business"}</label>
            <input
              id="rs-query"
              name="query"
              required
              maxLength={500}
              className="input"
              placeholder={mode === "website" ? "https://shop.example.com/contact" : mode === "company" ? "Quick Fix Phones" : "Mobile phone repair shops"}
            />
          </div>
          {mode !== "website" && (
            <div>
              <label className="label" htmlFor="rs-location">{mode === "area" ? "Area" : "City and state"}</label>
              <input id="rs-location" name="location" maxLength={200} className="input" placeholder="Houston, TX" required={mode === "area"} />
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Fields to collect" description="Only what you tick is collected. Every value keeps the page it came from.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RESEARCH_FIELDS.map((f) => (
            <label key={f} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition", fields.includes(f) ? "border-brand-line bg-brand-soft/40" : "border-line hover:bg-surface-2")}>
              <input type="checkbox" name="fields" value={f} checked={fields.includes(f)} onChange={() => toggle(f)} className="mt-0.5 size-4" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-fg"><Icon name={FIELD_ICON[f]} className="size-3.5 text-muted" />{RESEARCH_FIELD_LABEL[f].label}</span>
                <span className="block text-xs text-muted">{RESEARCH_FIELD_LABEL[f].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rs-max">Most businesses to collect</label>
            <input id="rs-max" name="maxResults" type="number" min={1} max={500} defaultValue={25} className="input" />
          </div>
        </div>
      </Step>

      <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
        <FormStatus state={state} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted">
            <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" />
            {chosen?.enabled ? "Results open in the import review before anything is saved." : `${chosen?.label ?? "This agent"} isn't connected, so nothing is sent anywhere. Saving keeps the request ready for later.`}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="submit" name="intent" value="save" disabled={pending} className="btn-secondary">
              <Icon name="check" className="size-4" /> {pending ? "Saving…" : "Save request"}
            </button>
            <button type="submit" name="intent" value="run" disabled={pending || !chosen?.enabled} className="btn-primary" title={chosen?.enabled ? undefined : "Connect an agent first"}>
              <Icon name="sparkles" className="size-4" /> Run research
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Step({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="card min-w-0 p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </fieldset>
  );
}
