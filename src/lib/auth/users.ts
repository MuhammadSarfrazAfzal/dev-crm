/**
 * Creating sign-in accounts. Locally that's the auth.users shim; on Supabase it's a real
 * Supabase Auth user (confirmed email/password identity), written with the database
 * connection because the app holds no service-role key. Passwords are bcrypt-hashed here,
 * which is the format Supabase Auth stores and checks.
 */
import bcrypt from "bcryptjs";
import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

export async function insertAuthUser(sql: Sql, u: { email: string; passwordHash: string; fullName: string }, provider = process.env.AUTH_PROVIDER): Promise<string> {
  if (provider !== "supabase") {
    const [row] = await sql`insert into auth.users (email, encrypted_password, raw_user_meta_data)
      values (${u.email}, ${u.passwordHash}, ${sql.json({ full_name: u.fullName })}) returning id`;
    return row.id;
  }
  const [row] = await sql`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ${u.email}, ${u.passwordHash}, now(),
      ${sql.json({ provider: "email", providers: ["email"] })}, ${sql.json({ full_name: u.fullName })}, now(), now(), '', '', '', '')
    returning id`;
  await sql`insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ${row.id}, ${row.id}::text,
      ${sql.json({ sub: row.id, email: u.email, email_verified: true })}, 'email', now(), now(), now())`;
  return row.id;
}

export async function setAuthPassword(sql: Sql, userId: string, passwordHash: string) {
  await sql`update auth.users set encrypted_password = ${passwordHash}, updated_at = now() where id = ${userId}`;
}
