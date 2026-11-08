import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { isUuid } from "@/lib/params";
import { storage } from "@/lib/storage";
import { safeFilename } from "@/lib/import/sniff";
import { storageAuthFor } from "@/lib/auth/supabase-session";

/** Serves a stored file only if the documents row is visible to the user under RLS. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [doc] = await asUser(user.id, (tx) => tx`select storage_key, filename, mime_type from documents where id = ${id}`);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let data: Buffer;
  try {
    data = await storage.get(doc.storage_key, await storageAuthFor(user.id));
  } catch (err) {
    console.error("file download failed", err);
    return NextResponse.json({ error: "The file couldn't be opened. Sign in again and retry." }, { status: 502 });
  }
  const name = safeFilename(doc.filename);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": doc.mime_type ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
