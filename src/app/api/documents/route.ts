import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { isUuid } from "@/lib/params";
import { storage } from "@/lib/storage";
import { safeFilename, validateFile } from "@/lib/import/sniff";
import { limits } from "@/lib/rate-limit";
import { seeOther } from "@/lib/http";
import { storageAuthFor } from "@/lib/auth/supabase-session";

const MAX_BYTES = 10 * 1024 * 1024;

/** Attach a document to a lead. Plain form post; redirects back to the lead. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const form = await request.formData();
  const leadId = String(form.get("leadId") ?? "");
  const file = form.get("file");
  const back = (msg: string) => seeOther(isUuid(leadId) ? `/leads/${leadId}?doc=${msg}#documents` : "/leads");
  if (!isUuid(leadId) || !(file instanceof File)) return back("missing");
  if (!limits.upload.check(`upload:${user.id}`).ok) return back("ratelimited");
  const buf = new Uint8Array(await file.arrayBuffer());
  const v = validateFile(file.name, buf, { maxBytes: MAX_BYTES });
  if (!v.ok || v.kind === "zip") return back("rejected");
  const auth = await storageAuthFor(user.id);
  const ok = await asUser(user.id, async (tx) => {
    const [lead] = await tx`select id from leads where id = ${leadId}`;
    if (!lead) return false;
    const key = await storage.put(buf, v.kind === "jpeg" ? "jpg" : v.kind, auth);
    const [doc] = await tx`insert into documents (lead_id, storage_key, filename, mime_type, size_bytes, uploaded_by)
      values (${leadId}, ${key}, ${safeFilename(file.name)}, ${v.mime}, ${buf.length}, ${user.id}) returning id`;
    await tx`select app.log_audit('document.uploaded', 'leads', ${leadId}, ${tx.json({ document_id: doc.id, filename: safeFilename(file.name) })})`;
    return true;
  });
  revalidatePath(`/leads/${leadId}`);
  return back(ok ? "uploaded" : "missing");
}
