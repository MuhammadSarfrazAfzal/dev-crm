"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { logCall, type ActionState } from "@/app/actions/lead";
import { INTEREST_LABEL, INTEREST_LEVELS, NEXT_STEPS, OUTCOME_LABEL, PRODUCT_LABEL, PRODUCTS, type CallOutcome, type Product } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import type { TimeView } from "@/lib/time";
import { CopyButton } from "../CopyButton";
import { Icon, type IconName } from "../icons";
import { cn } from "../ui";
import { Dropdown } from "../menu/Dropdown";
import { FollowupFields } from "./FollowupFields";
import { FormStatus } from "./FormStatus";

export type DialNumber = { e164: string; ext?: string | null; label: string; contactId: string | null; blocked: boolean };

type OutcomeOption = { id: CallOutcome; icon: IconName; hint: string; tone: "green" | "amber" | "brand" | "slate" | "red" };

const REACHED: OutcomeOption[] = [
  { id: "interested", icon: "star", hint: "Wants to hear more", tone: "green" },
  { id: "callback_requested", icon: "calendar", hint: "Asked us to call at another time", tone: "amber" },
  { id: "connected", icon: "users", hint: "Talked, no decision yet", tone: "brand" },
  { id: "not_interested", icon: "thumbsDown", hint: "Said no for now", tone: "slate" },
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
const ICON_TONE: Record<OutcomeOption["tone"], string> = { green: "text-success-fg", amber: "text-warning-fg", brand: "text-brand-fg", slate: "text-fg-2", red: "text-danger-fg" };

const NOT_INTERESTED_REASONS = ["Already has a solution", "Too expensive", "Not the decision maker", "Not right now", "Closing or moving"];

const POSITIVE: CallOutcome[] = ["interested", "connected"];
/** Outcomes where the shop could have said which product it wants. */
const TALKED_PRODUCTS: CallOutcome[] = ["interested", "connected", "callback_requested"];
const RETRY: CallOutcome[] = ["no_answer", "busy"];

function LogCallFormInner({
  state,
  action,
  pending,
  leadId,
  interested,
  bought,
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
  /** What the shop already wants or has bought, shown next to the product choice. */
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
  const [wantEmail, setWantEmail] = useState(emailRequired);
  const [schedule, setSchedule] = useState(true);
  const [nextStep, setNextStep] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [reason, setReason] = useState("");
  const [hangupNote, setHangupNote] = useState("");
  const selected = numbers.find((n) => n.e164 === phone);

  const isCallback = outcome === "callback_requested";
  const isPositive = POSITIVE.includes(outcome as CallOutcome);
  const noFollowup = outcome === "wrong_number";
  const followupOn = isCallback || (!noFollowup && !!outcome && schedule);

  function choose(o: CallOutcome) {
    setOutcome(o);
    // Sensible defaults per outcome; the rep can still change them.
    setSchedule(o !== "not_interested" && o !== "call_hangup");
    if (o === "interested") setWantEmail(true);
  }

  return (
    <form action={action} className="divide-y divide-line" data-testid="log-call-form">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="contactId" value={selected?.contactId ?? ""} />
      <input type="hidden" name="reason" value={outcome === "not_interested" ? reason : ""} />
      {hasPendingCallFollowup && outcome !== "callback_requested" && <input type="hidden" name="completeFollowups" value="on" />}

      <section className="p-5">
        <SectionTitle n={1} title="Call from your phone" hint="Copy a number, then come back here when you hang up." />
        {numbers.length === 0 ? (
          <p className="text-sm text-muted">No phone numbers on file. Add one under Company details.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {numbers.map((n) => (
              <li
                key={`${n.e164}-${n.contactId}`}
                className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition", phone === n.e164 ? "border-brand-line bg-brand-soft/50" : "border-line")}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input type="radio" name="dialed" checked={phone === n.e164} onChange={() => setPhone(n.e164)} disabled={n.blocked} className="size-4" />
                  <span className="min-w-0">
                    <span className={cn("block text-base font-semibold tracking-tight tabular-nums", n.blocked ? "text-subtle line-through" : "text-fg")} data-testid="phone-number">
                      {formatPhone(n.e164, n.ext)}
                    </span>
                    <span className="block truncate text-xs text-muted">{n.label}{n.blocked && " · do not call"}</span>
                  </span>
                </label>
                {!n.blocked && <CopyButton text={n.ext ? `${n.e164},${n.ext}` : n.e164} label="Copy number" className="btn-secondary btn-sm" onCopied={() => setPhone(n.e164)} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!callBlocked && (
        <>
          <section className="p-5">
            <SectionTitle n={2} title="How did the call go?" />
            <OutcomeGroup label="Reached someone" options={REACHED} value={outcome} onChange={choose} />
            <OutcomeGroup label="Didn't reach the owner" options={NOT_REACHED} value={outcome} onChange={choose} className="mt-4" />
          </section>

          {outcome && (
            <section className="space-y-5 bg-surface-2/60 p-5" data-testid="outcome-details">
              <SectionTitle n={3} title={isCallback ? "Call back details" : isPositive ? "What happens next?" : "Details"} />

              {outcome === "wrong_number" && <Notice tone="amber" icon="alert">If this was the only number, the lead is marked unqualified. Add the right number under Company details if you find it.</Notice>}

              {TALKED_PRODUCTS.includes(outcome) && <ProductChoice interested={interested} bought={bought} />}

              {isCallback && (
                <div>
                  <label className="label" htmlFor="call-callback-notes">When should we call back? (optional)</label>
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

              {isPositive && (
                <div>
                  <label className="label" htmlFor="call-next-step">Next step</label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {NEXT_STEPS.map((s) => (
                      <button key={s} type="button" onClick={() => setNextStep(s)} className={cn("chip", nextStep === s && "border-brand bg-brand-soft text-brand-fg")}>{s}</button>
                    ))}
                  </div>
                  <input id="call-next-step" name="nextStep" value={nextStep} onChange={(e) => setNextStep(e.target.value)} maxLength={300} className="input" placeholder="Or type your own, e.g. Bring a demo unit on Friday" />
                </div>
              )}

              {/* Send options: Email to send & WhatsApp to send */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">Send details to shop</span>
                  <span className="text-xs text-muted">Select what to send for each product</span>
                </div>

                {/* 8staros POS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-lg border border-line bg-surface-2/40">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-brand-fg"></span>
                    <span className="text-sm font-medium text-fg">8staros POS</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <label className="flex items-center gap-1.5 cursor-pointer text-fg hover:text-brand-fg">
                      <input type="checkbox" name="pos_send_email" className="size-4 rounded text-brand border-line" />
                      <Icon name="mail" className="size-3.5 text-sky-500" />
                      Email to send
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-fg hover:text-success-fg">
                      <input type="checkbox" name="pos_send_whatsapp" className="size-4 rounded text-success border-line" />
                      <Icon name="whatsapp" className="size-3.5 text-emerald-500" />
                      WhatsApp to send
                    </label>
                  </div>
                </div>

                {/* Wholesale */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-lg border border-line bg-surface-2/40">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-medium text-fg">Wholesale phones &amp; accessories</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <label className="flex items-center gap-1.5 cursor-pointer text-fg hover:text-brand-fg">
                      <input type="checkbox" name="wholesale_send_email" className="size-4 rounded text-brand border-line" />
                      <Icon name="mail" className="size-3.5 text-sky-500" />
                      Email to send
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-fg hover:text-success-fg">
                      <input type="checkbox" name="wholesale_send_whatsapp" className="size-4 rounded text-success border-line" />
                      <Icon name="whatsapp" className="size-3.5 text-emerald-500" />
                      WhatsApp to send
                    </label>
                  </div>
                </div>
              </div>

              {outcome === "not_interested" && (
                <div>
                  <span className="label">Main reason (optional)</span>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
                    {NOT_INTERESTED_REASONS.map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(reason === r ? "" : r)} className={cn("chip", reason === r && "border-fg-2 bg-surface-3 text-fg")}>{r}</button>
                    ))}
                  </div>
                </div>
              )}

              {outcome === "call_hangup" && (
                <div>
                  <label className="label" htmlFor="call-hangup-notes">What happened? (optional)</label>
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
                "Pick how the call went to save it."
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

const CHOICES = [
  { value: "", label: "Not yet" },
  { value: "interested", label: "Interested" },
  { value: "bought", label: "Bought" },
] as const;

/** Both products are offered on every call; the rep notes what the shop wants of each. */
function ProductChoice({ interested, bought }: { interested: Product[]; bought: Product[] }) {
  const [picked, setPicked] = useState<Record<Product, string>>({ pos: "", wholesale: "" });
  return (
    <fieldset className="min-w-0" data-testid="product-choice">
      <legend className="label">What do they want?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PRODUCTS.map((p) => (
          <div key={p} className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-fg">{PRODUCT_LABEL[p]}</span>
              {(bought.includes(p) || interested.includes(p)) && <span className="text-xs text-muted">{bought.includes(p) ? "Already bought" : "Interested before"}</span>}
            </div>
            <input type="hidden" name={`product_${p}`} value={picked[p]} />
            <div className="inline-flex w-full rounded-lg border border-line bg-surface-2 p-0.5 text-xs" role="radiogroup" aria-label={PRODUCT_LABEL[p]}>
              {CHOICES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={picked[p] === c.value}
                  onClick={() => setPicked((v) => ({ ...v, [p]: c.value }))}
                  className={cn("flex-1 rounded-md px-2 py-1 font-medium transition", picked[p] === c.value ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-muted hover:text-fg")}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-on-ink">{n}</span>
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function OutcomeGroup({ label, options, value, onChange, className }: { label: string; options: OutcomeOption[]; value: string; onChange: (o: CallOutcome) => void; className?: string }) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <label key={o.id} className={cn("relative flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition has-focus-visible:ring-2 has-focus-visible:ring-brand", on ? SELECTED[o.tone] : "border-line bg-surface hover:border-line-strong hover:bg-surface-2")}>
              <input type="radio" name="outcome" value={o.id} checked={on} onChange={() => onChange(o.id)} className="sr-only" required />
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
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", tone === "red" ? "border-danger-line bg-danger-soft text-danger-fg" : "border-warning-line bg-warning-soft text-warning-fg")}>
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
