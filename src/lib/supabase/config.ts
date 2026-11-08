/** Supabase project settings, read from the environment. Only the public URL and anon key; never a service key. */
export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

export const usesSupabaseAuth = () => process.env.AUTH_PROVIDER === "supabase";
