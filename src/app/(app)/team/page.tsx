import type { Metadata } from "next";
import { Dropdown } from "@/components/menu/Dropdown";
import { createUser, resetPassword } from "@/app/actions/team";
import { ActionForm } from "@/components/ActionForm";
import { UserRowActions } from "@/components/team/UserRowActions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { relativeTime } from "@/lib/format";
import { COMMON_TIME_ZONES } from "@/lib/us";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const admin = await requireAdmin();
  const users = await asUser(admin.id, (tx) => tx`
    select p.id, p.email, p.full_name, p.role, p.active, p.time_zone, p.created_at,
      (select count(*)::int from leads l where l.owner_id = p.id) as leads
    from profiles p order by p.active desc, p.full_name`);
  return (
    <>
      <PageHeader title="Team" subtitle="People who can sign in, their roles and lead counts" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {users.map((u) => (
            <Card key={u.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium text-fg">
                    {u.full_name}
                    <Badge tone={u.role === "admin" ? "brand" : "slate"}>{u.role === "admin" ? "Admin" : "Salesperson"}</Badge>
                    {!u.active && <Badge tone="red">Deactivated</Badge>}
                  </div>
                  <div className="text-sm text-muted">{u.email} · {u.time_zone} · {u.leads} leads · added {relativeTime(u.created_at)}</div>
                </div>
                <UserRowActions
                  user={{
                    id: u.id,
                    email: u.email,
                    full_name: u.full_name,
                    role: u.role,
                    active: u.active,
                  }}
                  adminId={admin.id}
                />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-brand-fg">Set a new password</summary>
                <div className="mt-2 max-w-sm">
                  <ActionForm action={resetPassword} submitLabel="Set password" submitClassName="btn-secondary py-1.5">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="password" name="password" minLength={10} required autoComplete="new-password" className="input" aria-label="New password" placeholder="At least 10 characters" />
                  </ActionForm>
                </div>
              </details>
            </Card>
          ))}
        </div>
        <Card title="Add a person">
          <ActionForm action={createUser} submitLabel="Create account">
            <div><label className="label" htmlFor="u-name">Name</label><input id="u-name" name="fullName" required maxLength={120} className="input" /></div>
            <div><label className="label" htmlFor="u-email">Email</label><input id="u-email" name="email" type="email" required className="input" /></div>
            <div>
              <label className="label" htmlFor="u-role">Role</label>
              <Dropdown id="u-role" name="role" defaultValue="salesperson" options={[{ value: "salesperson", label: "Salesperson" }, { value: "admin", label: "Admin" }]} />
            </div>
            <div>
              <label className="label" htmlFor="u-tz">Time zone</label>
              <Dropdown id="u-tz" name="timeZone" defaultValue="America/New_York" options={COMMON_TIME_ZONES.map((z) => ({ value: z, label: z }))} />
            </div>
            <div><label className="label" htmlFor="u-pw">Temporary password</label><input id="u-pw" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
