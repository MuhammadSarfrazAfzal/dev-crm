"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { logCall, type ActionState } from "@/app/actions/lead";
import { NEXT_STEPS, OUTCOME_LABEL, type CallOutcome, type Product } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import type { TimeView } from "@/lib/time";
import { CopyButton } from "../CopyButton";
import { Icon, type IconName } from "../icons";
import { cn } from "../ui";
import { FollowupFields } from "./FollowupFields";
import { FormStatus } from "./FormStatus";

export type DialNumber = { e164: string; ext?: string | null; label: string; contactId: string | null; blocked: boolean };

type OutcomeOption = { id: CallOutcome; icon: IconName; hint: string; tone: "green" | "amber" | "brand" | "slate" | "red" };

const REACHED: OutcomeOption[] = [
  { id: "agreed", icon: "calendar", hint: "Agreed to meeting with founder / demo", tone: "green" },
  { id: "interested", icon: "star", hint: "Interested in POS service, needs follow-up", tone: "brand" },
  { id: "callback_requested", icon: "phone", hint: "Asked us to call at another time", tone: "amber" },
  { id: "connected", icon: "users", hint: "Discovery in progress, qualifying needs", tone: "brand" },
  { id: "not_interested", icon: "thumbsDown", hint: "Not looking for custom POS", tone: "slate" },
  { id: "call_hangup", icon: "phoneOff", hint: "Customer hung up", tone: "red" },
];

const HANGUP_REASONS = [
  "Hung up immediately",
  "Hung up after intro",
  "Hung up when pitched",
  "Rude / hung up",
  "Owner busy and hung up",
];

const NOT_REACHED: OutcomeOption[] = [
  { id: "no_answer", icon: "phoneMissed", hint: "Nobody picked up", tone: "slate" },
  { id: "busy", icon: "phone", hint: "Line was busy", tone: "slate" },
  { id: "wrong_number", icon: "x", hint: "Not this business", tone: "red" },
];

const SELECTED: Record<OutcomeOption["tone"], string> = {
  green: "border-success bg-success-soft ring-3 ring-success/15",
  amber: "border-warning bg-warning-soft ring-3 ring-warning/15",
  brand: "border-brand bg-brand-soft ring-3 ring-brand/15",
  slate: "border-fg-2 bg-surface-3 ring-3 ring-fg/10",
  red: "border-danger bg-danger-soft ring-3 ring-danger/15",
};

const ICON_TONE: Record<OutcomeOption["tone"], string> = {
  green: "text-success-fg",
  amber: "text-warning-fg",
  brand: "text-brand-fg",
  slate: "text-fg-2",
  red: "text-danger-fg",
};

const NOT_INTERESTED_REASONS = [
  "Already has a POS solution",
  "Too expensive / no budget",
  "Not the decision maker",
  "Not looking for software right now",
  "Closing or moving",
];

const DISCOVERY_PAIN_POINTS = [
  "Needs custom retail POS",
  "Wants repair ticketing & IMEI tracking",
  "Multi-store inventory sync",
  "Wants tablet & mobile till",
  "Replacing legacy slow software",
  "Needs offline billing support",
];

const POSITIVE: CallOutcome[] = ["agreed", "interested", "connected"];

function LogCallFormInner({
  state,
  action,
  pending,
  leadId,
  numbers,
  emails,
  leadTz,
  leadState,
  view,
  usTz,
  hasPendingCallFollowup,
  emailRequired,
  callBlocked,
  backHref,
  backLabel,
}: {
  leadId: string;
  interested: Product[];
  bought: Product[];
  numbers: DialNumber[];
  emails: string[];
  leadTz: string | null;
  leadState: string | null;
  view: TimeView;
  usTz: string;
  hasPendingCallFollowup: boolean;
  emailRequired: boolean;
  callBlocked: boolean;
  backHref?: string;
  backLabel?: string;
  state: ActionState;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const router = useRouter();
  const firstOpen = numbers.find((n) => !n.blocked);
  const [phone, setPhone] = useState(firstOpen?.e164 ?? "");
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [meetingAgreed, setMeetingAgreed] = useState(false);
  const [demoRequested, setDemoRequested] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sendEmail, setSendEmail] = useState(emailRequired);
  const [nextStep, setNextStep] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [reason, setReason] = useState("");
  const [hangupNote, setHangupNote] = useState("");
  const selected = numbers.find((n) => n.e164 === phone);

  const isCallback = outcome === "callback_requested";
  const isPositive = POSITIVE.includes(outcome as CallOutcome);

  function choose(o: CallOutcome) {
    setOutcome(o);
    if (o === "agreed") {
      setMeetingAgreed(true);
      setDemoRequested(true);
      setSendWhatsApp(true);
      setNextStep("Meeting with Founder to close deal");
    } else if (o === "interested") {
      setMeetingAgreed(false);
      setDemoRequested(true);
      setSendWhatsApp(true);
      setNextStep("Live POS Services Demo");
    } else if (o === "connected") {
      setMeetingAgreed(false);
      setDemoRequested(false);
      setNextStep("Follow up on discovery call");
    }
  }

  function addDiscoveryPoint(point: string) {
    setNotes((prev) => (prev ? `${prev}\n• ${point}` : `• ${point}`));
  }

  return (
    <form action={action} className="divide-y divide-line" data-testid="log-call-form">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="contactId" value={selected?.contactId ?? ""} />
      <input type="hidden" name="reason" value={outcome === "not_interested" ? reason : ""} />
      {hasPendingCallFollowup && outcome !== "callback_requested" && (
        <input type="hidden" name="completeFollowups" value="on" />
      )}

      {/* 1. Phone numbers to dial */}
      <section className="p-5">
        <SectionTitle n={1} title="Call from your phone" hint="Copy a number, then log the discovery call outcome below." />
        {numbers.length === 0 ? (
          <p className="text-sm text-muted">No phone numbers on file. Add one under Company details.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {numbers.map((n) => (
              <li
                key={`${n.e164}-${n.contactId}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition",
                  phone === n.e164 ? "border-brand-line bg-brand-soft/50" : "border-line"
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="radio"
                    name="dialed"
                    checked={phone === n.e164}
                    onChange={() => setPhone(n.e164)}
                    disabled={n.blocked}
                    className="size-4"
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-base font-semibold tracking-tight tabular-nums",
                        n.blocked ? "text-subtle line-through" : "text-fg"
                      )}
                      data-testid="phone-number"
                    >
                      {formatPhone(n.e164, n.ext)}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {n.label}
                      {n.blocked && " · do not call"}
                    </span>
                  </span>
                </label>
                {!n.blocked && (
                  <CopyButton
                    text={n.ext ? `${n.e164},${n.ext}` : n.e164}
                    label="Copy number"
                    className="btn-secondary btn-sm"
                    onCopied={() => setPhone(n.e164)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!callBlocked && (
        <>
          {/* 2. Call Outcome */}
          <section className="p-5">
            <SectionTitle n={2} title="Discovery call outcome" hint="Did the client agree to a meeting or demo with the founder?" />
            <OutcomeGroup label="Reached someone (Discovery)" options={REACHED} value={outcome} onChange={choose} />
            <OutcomeGroup label="Didn't reach the owner" options={NOT_REACHED} value={outcome} onChange={choose} className="mt-4" />
          </section>

          {/* 3. Outcome Details & Meeting Setup */}
          {outcome && (
            <section className="space-y-5 bg-surface-2/60 p-5" data-testid="outcome-details">
              <SectionTitle
                n={3}
                title={
                  outcome === "agreed"
                    ? "Founder Meeting & POS Demo Setup"
                    : isCallback
                    ? "Call back details"
                    : isPositive
                    ? "POS Development Discovery Details"
                    : "Details"
                }
              />

              {outcome === "wrong_number" && (
                <Notice tone="amber" icon="alert">
                  If this was the only number, the lead is marked unqualified. Add the right number under Company details if you find it.
                </Notice>
              )}

              {/* Discovery Call & Meeting Details for Positive Outcomes */}
              {isPositive && (
                <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-fg">POS Development Service &amp; Meeting Setup</h4>
                      <p className="text-xs text-muted">Team discovery qualification &amp; founder closing meeting</p>
                    </div>
                    {(outcome === "agreed" || meetingAgreed) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success-fg border border-success-line">
                        <Icon name="check" className="size-3" /> Meeting Agreed
                      </span>
                    )}
                  </div>

                  {/* Meeting with Founder & Demo Checkboxes */}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition",
                        meetingAgreed ? "border-brand-line bg-brand-soft/40 ring-1 ring-brand-line" : "border-line bg-surface-2/40 hover:bg-surface-2"
                      )}
                    >
                      <input
                        type="checkbox"
                        name="meeting_agreed"
                        checked={meetingAgreed}
                        onChange={(e) => setMeetingAgreed(e.target.checked)}
                        className="mt-0.5 size-4 rounded text-brand border-line"
                      />
                      <div className="text-xs">
                        <span className="block font-semibold text-fg">Meeting with Founder (to close deal)</span>
                        <span className="text-muted">Client agreed to set a meeting with you</span>
                      </div>
                    </label>

                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition",
                        demoRequested ? "border-brand-line bg-brand-soft/40 ring-1 ring-brand-line" : "border-line bg-surface-2/40 hover:bg-surface-2"
                      )}
                    >
                      <input
                        type="checkbox"
                        name="demo_requested"
                        checked={demoRequested}
                        onChange={(e) => setDemoRequested(e.target.checked)}
                        className="mt-0.5 size-4 rounded text-brand border-line"
                      />
                      <div className="text-xs">
                        <span className="block font-semibold text-fg">Live POS Services Demo</span>
                        <span className="text-muted">Client wants demo of how we give services</span>
                      </div>
                    </label>
                  </div>

                  {/* Channel Delivery Options: WhatsApp & Email */}
                  <div className="rounded-lg border border-line bg-surface-2/30 p-3 space-y-3">
                    <div className="text-xs font-medium text-fg">Send meeting invite &amp; details via:</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {/* WhatsApp */}
                      <div
                        className={cn(
                          "rounded-lg border p-3 transition",
                          sendWhatsApp
                            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                            : "border-line bg-surface"
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            name="send_whatsapp"
                            checked={sendWhatsApp}
                            onChange={(e) => setSendWhatsApp(e.target.checked)}
                            className="size-4 rounded text-emerald-600 border-line"
                          />
                          <Icon name="whatsapp" className="size-4 text-emerald-600" />
                          <span className="text-xs font-semibold text-fg">Send on WhatsApp</span>
                        </label>
                        {sendWhatsApp && (
                          <div className="mt-2 text-xs text-muted">
                            <span className="block text-[11px]">Creates task in WhatsApp tab to send with 1 click:</span>
                            <span className="font-mono font-semibold text-fg">{phone || "Selected number"}</span>
                          </div>
                        )}
                      </div>

                      {/* Email */}
                      <div
                        className={cn(
                          "rounded-lg border p-3 transition",
                          sendEmail
                            ? "border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20"
                            : "border-line bg-surface"
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            name="send_email"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                            className="size-4 rounded text-sky-600 border-line"
                          />
                          <Icon name="mail" className="size-4 text-sky-600" />
                          <span className="text-xs font-semibold text-fg">Send on Email</span>
                        </label>
                        {sendEmail && (
                          <div className="mt-2 text-xs text-muted">
                            <span className="block text-[11px]">Creates pending task in Emails tab:</span>
                            <input
                              type="email"
                              name="emailTo"
                              defaultValue={emails[0] ?? ""}
                              placeholder="client@example.com"
                              className="input input-sm mt-1 w-full text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Schedule Meeting Date / Follow-up Time */}
                  <div className="pt-2 border-t border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-fg">
                        {outcome === "agreed" || meetingAgreed ? "Schedule Meeting Time with Founder" : "Schedule Next Call / Follow-up"}
                      </label>
                      <span className="text-xs text-muted">Shop time &amp; Pakistan time</span>
                    </div>
                    <FollowupFields
                      leadTz={leadTz}
                      leadState={leadState}
                      view={view}
                      usTz={usTz}
                      idPrefix="call-meeting"
                      defaultKind="call"
                      kindName="followupKind"
                    />
                    <input type="hidden" name="scheduleFollowup" value="on" />
                  </div>
                </div>
              )}

              {/* Callback Requested specifics */}
              {isCallback && (
                <div>
                  <label className="label" htmlFor="call-callback-notes">
                    When should we call back? (optional)
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {["Call this afternoon", "Call tomorrow", "Call next week", "Call after 3 PM", "Owner busy right now"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCallbackNote(s)}
                        className={cn("chip", callbackNote === s && "border-brand bg-brand-soft text-brand-fg")}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <input
                    id="call-callback-notes"
                    name="notes"
                    value={callbackNote}
                    onChange={(e) => setCallbackNote(e.target.value)}
                    maxLength={500}
                    className="input"
                    placeholder="e.g. Call tomorrow at 2 PM, owner is busy right now"
                  />
                </div>
              )}

              {/* Next Step */}
              {isPositive && (
                <div>
                  <label className="label" htmlFor="call-next-step">
                    Next step
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {NEXT_STEPS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNextStep(s)}
                        className={cn("chip", nextStep === s && "border-brand bg-brand-soft text-brand-fg")}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <input
                    id="call-next-step"
                    name="nextStep"
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                    maxLength={300}
                    className="input"
                    placeholder="e.g. Founder closing meeting on Zoom, or Live demo of POS services"
                  />
                </div>
              )}

              {/* Discovery Notes / Requirements for Founder */}
              {isPositive && (
                <div>
                  <label className="label" htmlFor="call-discovery-notes">
                    Discovery findings &amp; requirements for Founder
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {DISCOVERY_PAIN_POINTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => addDiscoveryPoint(p)}
                        className="chip hover:border-brand hover:text-brand-fg"
                      >
                        + {p}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="call-discovery-notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    className="input text-xs"
                    placeholder="e.g. Client currently uses Clover POS, wants custom repair ticketing and multi-location inventory. Interested in custom development; agreed to demo with founder on Thursday."
                  />
                </div>
              )}

              {/* Not Interested reason */}
              {outcome === "not_interested" && (
                <div>
                  <span className="label">Main reason (optional)</span>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
                    {NOT_INTERESTED_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={reason === r}
                        onClick={() => setReason(reason === r ? "" : r)}
                        className={cn("chip", reason === r && "border-fg-2 bg-surface-3 text-fg")}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Call Hang-up explanation */}
              {outcome === "call_hangup" && (
                <div>
                  <label className="label" htmlFor="call-hangup-notes">
                    What happened? (optional)
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hang-up reason">
                    {HANGUP_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={hangupNote === r}
                        onClick={() => setHangupNote(hangupNote === r ? "" : r)}
                        className={cn("chip", hangupNote === r && "border-danger bg-danger-soft text-danger-fg")}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    id="call-hangup-notes"
                    name="hangupExplanation"
                    value={hangupNote}
                    onChange={(e) => setHangupNote(e.target.value)}
                    maxLength={500}
                    className="input"
                    placeholder="e.g. Customer answered, heard company name and hung up"
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Form Submission & Status */}
      <div className="space-y-3 p-5">
        <FormStatus state={state} />
        {state.ok && backHref && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl border border-success-line bg-success-soft/50 p-3 text-sm">
            <span className="font-medium text-success-fg">Ready to move to the next lead?</span>
            <Link
              href={backHref}
              onClick={() => {
                router.refresh();
              }}
              className="btn-secondary btn-sm bg-surface font-semibold text-fg hover:text-brand-fg inline-flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
            >
              <Icon name="arrowLeft" className="size-3.5" /> Back to {backLabel || "Leads"}
            </Link>
          </div>
        )}
        {!callBlocked && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              {outcome ? (
                <>
                  Saving <strong className="text-fg">{OUTCOME_LABEL[outcome]}</strong>
                  {nextStep && isPositive ? <> · next: {nextStep}</> : null}
                  {callbackNote && isCallback ? <> · {callbackNote}</> : null}
                  {hangupNote && outcome === "call_hangup" ? <> · {hangupNote}</> : null}
                  . Calls can&apos;t be edited later.
                </>
              ) : (
                "Pick discovery call outcome to save it."
              )}
            </p>
            <button type="submit" disabled={pending || !outcome} className="btn-primary">
              <Icon name="check" className="size-4" /> {pending ? "Saving…" : "Save call"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-on-ink">
        {n}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function OutcomeGroup({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: OutcomeOption[];
  value: string;
  onChange: (o: CallOutcome) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <label
              key={o.id}
              className={cn(
                "relative flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition has-focus-visible:ring-2 has-focus-visible:ring-brand",
                on ? SELECTED[o.tone] : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              )}
            >
              <input
                type="radio"
                name="outcome"
                value={o.id}
                checked={on}
                onChange={() => onChange(o.id)}
                className="sr-only"
                required
              />
              <Icon name={o.icon} className={cn("mt-0.5 size-4 shrink-0", on ? ICON_TONE[o.tone] : "text-subtle")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{OUTCOME_LABEL[o.id]}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Notice({ tone, icon, children }: { tone: "red" | "amber"; icon: IconName; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "red"
          ? "border-danger-line bg-danger-soft text-danger-fg"
          : "border-warning-line bg-warning-soft text-warning-fg"
      )}
    >
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

type Props = Omit<Parameters<typeof LogCallFormInner>[0], "state" | "action" | "pending">;

/** Remounts the inner form after each successful save so every field starts fresh. */
export function LogCallForm(props: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logCall, {});
  return <LogCallFormInner key={state.savedAt ?? 0} {...props} state={state} action={action} pending={pending} />;
}
