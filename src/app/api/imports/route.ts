import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { isUuid } from "@/lib/params";
import { createImport, ImportError } from "@/server/imports";
import { seeOther } from "@/lib/http";
import { storageAuthFor } from "@/lib/auth/supabase-session";

export const maxDuration = 300;

/** Upload or paste → parsed preview. Plain form post; redirects to the preview page. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const fail = (msg: string) => seeOther(`/imports/new?error=${encodeURIComponent(msg)}`);

  const rl = limits.upload.check(`upload:${user.id}`);
  if (!rl.ok) return fail(`Too many imports this hour. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} min.`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload was too large or interrupted (20 MB max).");
  }
  let assignTo: string | null = String(form.get("assignTo") ?? "") || null;
  if (assignTo && !isUuid(assignTo)) assignTo = null;
  if (user.role !== "admin") assignTo = user.id;
  if (assignTo && user.role === "admin") {
    const [p] = await asUser(user.id, (tx) => tx`select id from profiles where id = ${assignTo} and active`);
    if (!p) return fail("Pick an active salesperson to assign to.");
  }

  const file = form.get("file");
  const text = String(form.get("text") ?? "");
  try {
    const id = await createImport({
      user,
      assignTo,
      file: file instanceof File && file.size > 0 ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : undefined,
      text: file instanceof File && file.size > 0 ? undefined : text,
      storageAuth: await storageAuthFor(user.id),
    });
    return seeOther(`/imports/${id}`);
  } catch (err) {
    if (err instanceof ImportError) return fail(err.message);
    console.error("import failed", err);
    return fail("Something went wrong reading that input.");
  }
}
