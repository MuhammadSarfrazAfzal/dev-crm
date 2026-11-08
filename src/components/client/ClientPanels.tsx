import { saveContact, updateCompany } from "@/app/actions/lead";
import { ActionForm } from "../ActionForm";
import { SuppressionBadge } from "../badges";
import { CopyButton } from "../CopyButton";
import { Icon } from "../icons";
import { Dropdown } from "../menu/Dropdown";
import { Avatar, Badge, Card, DetailList } from "../ui";
import { SUPPRESSION_LABEL } from "@/lib/labels";
import { formatPhone, type StoredPhone } from "@/lib/phone";
import { COMMON_TIME_ZONES, stateName } from "@/lib/us";

type Email = { address: string; label?: string | null };

export type CompanyView = {
  id: string;
  name: string;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  time_zone: string | null;
  phones: StoredPhone[];
  emails: Email[];
  suppression: string;
  suppression_reason: string | null;
  notes: string | null;
  source: string | null;
  tags: string[];
};

export type ContactView = {
  id: string;
  full_name: string | null;
  title: string | null;
  phones: StoredPhone[];
  emails: Email[];
  suppression: string;
};

/** Phone with a copy button; struck through when calling is blocked. */
export function PhoneLine({ phone, blocked }: { phone: StoredPhone; blocked?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={blocked ? "text-subtle line-through tabular-nums" : "font-medium tabular-nums"}>{formatPhone(phone.e164, phone.ext)}</span>
      {phone.label && <span className="text-xs text-muted">{phone.label}</span>}
      {!blocked && <CopyButton text={phone.ext ? `${phone.e164},${phone.ext}` : phone.e164} label="Copy" className="text-xs font-medium text-brand-fg hover:underline" />}
    </span>
  );
}

export function EmailLine({ email, blocked }: { email: Email; blocked?: boolean }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <a href={`mailto:${email.address}`} className={blocked ? "text-subtle line-through" : "link break-all"}>{email.address}</a>
      {!blocked && <CopyButton text={email.address} label="Copy" className="text-xs font-medium text-brand-fg hover:underline" />}
    </span>
  );
}

/** Everything we know about the business, with an edit form for people allowed to change it. */
export function CompanyDetailsCard({ company: c, editLeadId }: { company: CompanyView; editLeadId?: string | null }) {
  const noCall = c.suppression === "do_not_call" || c.suppression === "do_not_contact";
  const noEmail = c.suppression === "do_not_email" || c.suppression === "do_not_contact";
  const place = [c.city, c.state && stateName(c.state), c.postal_code].filter(Boolean).join(", ");
  return (
    <Card title="Client details" icon="companies" actions={<SuppressionBadge suppression={c.suppression} />}>
      <DetailList
        items={[
          { label: "Phone", icon: "phone", value: c.phones.length ? <span className="space-y-1">{c.phones.map((p) => <PhoneLine key={p.e164} phone={p} blocked={noCall} />)}</span> : null },
          { label: "Email", icon: "mail", value: c.emails.length ? <span className="space-y-1">{c.emails.map((e) => <EmailLine key={e.address} email={e} blocked={noEmail} />)}</span> : <span className="text-subtle">Not listed</span> },
          { label: "Website", icon: "globe", value: c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">{c.website.replace(/^https?:\/\//, "")}</a> : null },
          { label: "Address", icon: "pin", value: c.address || place ? <>{c.address && <span className="block">{c.address}</span>}{place && <span className="block text-muted">{place}</span>}</> : null },
          { label: "Time zone", icon: "clock", value: c.time_zone },
          { label: "Found on", icon: "link", value: c.source },
          { label: "Area", icon: "tag", value: c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} tone="sky">{t}</Badge>)}</span> : null },
          ...(c.notes ? [{ label: "Notes", icon: "note" as const, value: <span className="whitespace-pre-wrap">{c.notes}</span> }] : []),
          ...(c.suppression !== "none" && c.suppression_reason ? [{ label: "Why blocked", icon: "ban" as const, value: c.suppression_reason }] : []),
        ]}
      />
      {editLeadId && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-fg"><Icon name="edit" className="size-3.5" /> Edit details</summary>
          <div className="mt-3">
            <ActionForm action={updateCompany} submitLabel="Save details" reset={false} submitClassName="btn-primary">
              <input type="hidden" name="leadId" value={editLeadId} />
              <Field label="Business name" name="name" defaultValue={c.name} required />
              <Field label="Phones" hint="Comma or new line between numbers" name="phones" defaultValue={c.phones.map((p) => formatPhone(p.e164, p.ext)).join(", ")} />
              <Field label="Emails" hint="Comma between addresses" name="emails" defaultValue={c.emails.map((e) => e.address).join(", ")} />
              <Field label="Website" name="website" defaultValue={c.website ?? ""} />
              <Field label="Street address" name="address" defaultValue={c.address ?? ""} />
              <div className="grid grid-cols-3 gap-2">
                <Field label="City" name="city" defaultValue={c.city ?? ""} />
                <Field label="State" name="state" defaultValue={c.state ?? ""} />
                <Field label="ZIP" name="postalCode" defaultValue={c.postal_code ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor={`co-tz-${c.id}`}>Time zone</label>
                <Dropdown id={`co-tz-${c.id}`} name="timeZone" defaultValue={c.time_zone ?? ""} options={[{ value: "", label: "From state" }, ...COMMON_TIME_ZONES.map((z) => ({ value: z, label: z }))]} />
              </div>
              <div>
                <label className="label" htmlFor={`co-sup-${c.id}`}>Contact permission</label>
                <Dropdown id={`co-sup-${c.id}`} name="suppression" defaultValue={c.suppression} options={Object.entries(SUPPRESSION_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
              </div>
              <Field label="Reason (for do-not-contact)" name="suppressionReason" defaultValue={c.suppression_reason ?? ""} />
              <div>
                <label className="label" htmlFor={`co-notes-${c.id}`}>Notes</label>
                <textarea id={`co-notes-${c.id}`} name="notes" rows={2} defaultValue={c.notes ?? ""} className="input" />
              </div>
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}

export function ContactsCard({ contacts, primaryId, editLeadId, companyBlocked }: { contacts: ContactView[]; primaryId?: string | null; editLeadId?: string | null; companyBlocked?: boolean }) {
  return (
    <Card title={`Contacts (${contacts.length})`} icon="users">
      {contacts.length === 0 && <p className="mb-3 text-sm text-muted">No named contacts yet. Add the owner or manager when you learn their name.</p>}
      <ul className="space-y-4">
        {contacts.map((ct) => {
          const noCall = companyBlocked || ct.suppression === "do_not_call" || ct.suppression === "do_not_contact";
          return (
            <li key={ct.id} className="flex gap-3" data-testid="contact">
              <Avatar name={ct.full_name} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
                  {ct.full_name ?? "Unnamed contact"}
                  {ct.id === primaryId && <Badge tone="brand">Primary</Badge>}
                  <SuppressionBadge suppression={ct.suppression} />
                </div>
                {ct.title && <div className="text-xs text-muted">{ct.title}</div>}
                <div className="mt-1.5 space-y-1">
                  {ct.phones.map((p) => <PhoneLine key={p.e164} phone={p} blocked={noCall} />)}
                  {ct.emails.map((e) => <EmailLine key={e.address} email={e} blocked={ct.suppression === "do_not_email" || ct.suppression === "do_not_contact"} />)}
                  {ct.phones.length === 0 && ct.emails.length === 0 && <span className="text-xs text-subtle">No direct phone or email</span>}
                </div>
                {editLeadId && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand-fg">Edit contact</summary>
                    <div className="mt-2"><ContactFields leadId={editLeadId} contact={ct} /></div>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editLeadId && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-fg"><Icon name="plus" className="size-3.5" /> Add contact</summary>
          <div className="mt-3"><ContactFields leadId={editLeadId} /></div>
        </details>
      )}
    </Card>
  );
}

function ContactFields({ leadId, contact }: { leadId: string; contact?: ContactView }) {
  const p = contact?.id ?? "new";
  return (
    <ActionForm action={saveContact} submitLabel={contact ? "Save contact" : "Add contact"} reset={!contact} submitClassName="btn-secondary">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="contactId" value={contact?.id ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <Field id={`ct-name-${p}`} label="Name" name="fullName" defaultValue={contact?.full_name ?? ""} />
        <Field id={`ct-title-${p}`} label="Job title" name="title" defaultValue={contact?.title ?? ""} />
      </div>
      <Field id={`ct-phones-${p}`} label="Phones" name="phones" defaultValue={contact?.phones.map((ph) => formatPhone(ph.e164, ph.ext)).join(", ") ?? ""} />
      <Field id={`ct-emails-${p}`} label="Emails" name="emails" defaultValue={contact?.emails.map((e) => e.address).join(", ") ?? ""} />
      <div>
        <label className="label" htmlFor={`ct-sup-${p}`}>Contact permission</label>
        <Dropdown id={`ct-sup-${p}`} name="suppression" defaultValue={contact?.suppression ?? "none"} options={Object.entries(SUPPRESSION_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-2"><input type="checkbox" name="makePrimary" className="size-4" /> Primary contact for this lead</label>
    </ActionForm>
  );
}

function Field({ label, name, defaultValue, required, hint, id }: { label: string; name: string; defaultValue?: string; required?: boolean; hint?: string; id?: string }) {
  const fid = id ?? `f-${name}`;
  return (
    <div>
      <label className="label" htmlFor={fid}>{label}</label>
      <input id={fid} name={name} defaultValue={defaultValue} required={required} className="input" />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
