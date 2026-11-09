import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth/current";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "upload", text: "Turn any lead list (PDF, Excel, Word, photos) into clean rows" },
  { icon: "phone", text: "Copy a number, call, and record the answer in seconds" },
  { icon: "clock", text: "Call-backs scheduled in the shop's own time zone" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production" && process.env.AUTH_PROVIDER !== "supabase";
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#312e81] via-[#4338ca] to-[#6d28d9] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25"><Icon name="star" className="size-5" strokeWidth={2} /></span>
          <span className="font-semibold">Devsolutionspk Sales CRM</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Every shop, every call, every follow-up in one place.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-sm text-white/85">
                <span className="rounded-md bg-white/10 p-1.5 ring-1 ring-white/20"><Icon name={p.icon} className="size-4" /></span>
                <span className="pt-1">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">8staros POS · Star Cellular Wholesale</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white shadow-sm"><Icon name="star" className="size-5" strokeWidth={2} /></span>
            <div className="text-sm font-semibold text-fg">Devsolutionspk Sales CRM</div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Welcome back. Use your work email and password.</p>
          <LoginForm next={next} />
          {showDemo && (
            <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface-2 p-3 text-xs text-muted">
              <div className="mb-1 font-semibold text-fg-2">Demo accounts (fake seed data)</div>
              <div>Admin: admin@example.com / Admin123!demo</div>
              <div>Sales: sam@example.com or riley@example.com / Sales123!demo</div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
