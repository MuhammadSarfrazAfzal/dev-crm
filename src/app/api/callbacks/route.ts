import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { isUuid } from "@/lib/params";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const statusFilter = sp.get("status") ?? "pending"; // 'pending' | 'done' | 'all'
  const scope = sp.get("scope") ?? (user.role === "admin" ? "all" : "mine");

  const rows = await asUser(user.id, async (tx) => {
    return await tx`
      with combined as (
        select 
          ca.id as id,
          ca.id as call_id,
          l.id as lead_id,
          c.name as company_name,
          c.city,
          c.state,
          p.full_name as caller_name,
          coalesce(ca.phone_e164, c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
          ca.occurred_at as call_at,
          ca.outcome::text as call_outcome,
          ca.notes as call_notes,
          ca.next_step as call_next_step,
          ca.user_id as user_id,
          fo.id as followup_id,
          coalesce(fo.status::text, 'pending') as status
        from call_activities ca
        join leads l on l.id = ca.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = ca.contact_id or ct.id = l.primary_contact_id
        left join profiles p on p.id = ca.user_id
        left join lateral (
          select f.id, f.status
          from followups f
          where f.lead_id = l.id and f.kind = 'call'
          order by (case when f.status = 'pending' then 0 else 1 end), abs(extract(epoch from (f.created_at - ca.occurred_at))) asc limit 1
        ) fo on true
        where ca.outcome = 'callback_requested'

        union all

        select
          fo.id as id,
          null as call_id,
          l.id as lead_id,
          c.name as company_name,
          c.city,
          c.state,
          p.full_name as caller_name,
          coalesce(c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
          fo.created_at as call_at,
          'callback_requested' as call_outcome,
          fo.notes as call_notes,
          null as call_next_step,
          fo.assigned_to as user_id,
          fo.id as followup_id,
          fo.status::text as status
        from followups fo
        join leads l on l.id = fo.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = l.primary_contact_id
        left join profiles p on p.id = fo.created_by
        where fo.kind = 'call'
          and (fo.notes ilike '%call back%' or fo.notes ilike '%callback%')
          and not exists (
            select 1 from call_activities ca2
            where ca2.lead_id = fo.lead_id and ca2.outcome = 'callback_requested'
              and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
          )
      )
      select * from combined
      where (${statusFilter === "all"} or status = ${statusFilter})
        and (${scope === "all" || user.role !== "admin"} or user_id = ${user.id})
      order by call_at desc
      limit 250
    `;
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    data: rows,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const body = await request.json();
    const { leadId, followupId, status = "done" } = body;

    if (!leadId || !isUuid(leadId)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    await asUser(user.id, async (tx) => {
      if (followupId && isUuid(followupId)) {
        await tx`update followups set status = ${status}, completed_at = now() where id = ${followupId}`;
      } else {
        await tx`update followups set status = ${status}, completed_at = now()
          where lead_id = ${leadId} and kind = 'call' and status = 'pending'`;
      }
    });

    revalidatePath("/callbacks");
    revalidatePath("/followups");
    revalidatePath("/reports");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/");

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("POST /api/callbacks error:", err);
    return NextResponse.json({ error: "Failed to update callback status" }, { status: 500 });
  }
}

