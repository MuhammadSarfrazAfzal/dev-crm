import type { Metadata } from "next";
import { Dropdown } from "@/components/menu/Dropdown";
import { changePassword, updateProfile } from "@/app/actions/profile";
import { ActionForm } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/current";
import { COMMON_TIME_ZONES } from "@/lib/us";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const zones = COMMON_TIME_ZONES.includes(user.usTimeZone) ? COMMON_TIME_ZONES : [user.usTimeZone, ...COMMON_TIME_ZONES];
  return (
    <>
      <PageHeader title="Settings" subtitle={`${user.email} · ${user.role === "admin" ? "Admin" : "Salesperson"}`} />
      <div className="max-w-lg">
        <Card title="Your profile">
          <ActionForm action={updateProfile} submitLabel="Save" reset={false}>
            <div>
              <label className="label" htmlFor="fullName">Name</label>
              <input id="fullName" name="fullName" defaultValue={user.fullName} required maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="timeZone">Your USA time zone</label>
              <Dropdown id="timeZone" name="timeZone" defaultValue={user.usTimeZone} options={zones.map((z) => ({ value: z, label: z }))} />
              <p className="mt-1 text-xs text-muted">USA time is the main time in the CRM: follow-ups show in each shop&apos;s own time, and this zone decides what &quot;today&quot; means. To see everything in Pakistan time instead, use the USA / PK switch at the bottom of the menu.</p>
            </div>
          </ActionForm>
        </Card>
        <Card title="Change password" icon="lock" className="mt-6">
          <ActionForm action={changePassword} submitLabel="Change password">
            <div>
              <label className="label" htmlFor="pw-current">Current password</label>
              <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pw-next">New password</label>
              <input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={10} className="input" />
              <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
            </div>
            <div>
              <label className="label" htmlFor="pw-confirm">New password again</label>
              <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} className="input" />
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
