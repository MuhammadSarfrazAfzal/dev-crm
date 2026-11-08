import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * File storage adapter. `local` writes outside the web root under UPLOAD_DIR with random
 * names. `supabase` uses a private Supabase Storage bucket, acting as the signed-in user
 * (their access token), so the bucket's own policies apply as well. Either way files are
 * only ever served through routes that check access first.
 */
export type StorageAuth = { accessToken?: string | null };

export interface Storage {
  readonly provider: "local" | "supabase";
  put(data: Uint8Array, ext: string, auth?: StorageAuth): Promise<string>;
  get(key: string, auth?: StorageAuth): Promise<Buffer>;
  /** Removes a stored file; missing files are fine. */
  remove(key: string, auth?: StorageAuth): Promise<void>;
}

export const BUCKET = "crm-files";
const KEY_RE = /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
const MIME: Record<string, string> = {
  pdf: "application/pdf", csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain", png: "image/png", jpg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const newKey = (ext: string) => `${randomUUID()}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin"}`;

function localStorage(): Storage {
  const root = path.resolve(process.env.UPLOAD_DIR ?? ".local/uploads");
  return {
    provider: "local",
    async put(data, ext) {
      const key = newKey(ext);
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(path.join(root, key), data, { mode: 0o600, flag: "wx" });
      return key;
    },
    async get(key) {
      if (!KEY_RE.test(key)) throw new Error("invalid storage key");
      return fs.readFile(path.join(root, key));
    },
    async remove(key) {
      if (!KEY_RE.test(key)) throw new Error("invalid storage key");
      await fs.rm(path.join(root, key), { force: true });
    },
  };
}

function supabaseStorage(): Storage {
  const cfg = () => {
    const c = supabaseConfig();
    if (!c) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set for Supabase Storage");
    return c;
  };
  const headers = (auth?: StorageAuth) => {
    if (!auth?.accessToken) throw new Error("Sign in again to upload or open files.");
    return { apikey: cfg().anonKey, authorization: `Bearer ${auth.accessToken}` };
  };
  return {
    provider: "supabase",
    async put(data, ext, auth) {
      const key = newKey(ext);
      const res = await fetch(`${cfg().url}/storage/v1/object/${BUCKET}/${key}`, {
        method: "POST",
        headers: { ...headers(auth), "content-type": MIME[ext] ?? "application/octet-stream", "x-upsert": "false" },
        body: Buffer.from(data),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
      return key;
    },
    async get(key, auth) {
      if (!KEY_RE.test(key)) throw new Error("invalid storage key");
      const res = await fetch(`${cfg().url}/storage/v1/object/authenticated/${BUCKET}/${key}`, { headers: headers(auth), cache: "no-store" });
      if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key, auth) {
      if (!KEY_RE.test(key)) throw new Error("invalid storage key");
      const res = await fetch(`${cfg().url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...headers(auth), "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [key] }),
        cache: "no-store",
      });
      if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
    },
  };
}

export const storage: Storage = process.env.STORAGE_PROVIDER === "supabase" ? supabaseStorage() : localStorage();
