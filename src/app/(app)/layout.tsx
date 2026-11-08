import { AppNav } from "@/components/AppNav";
import { ClockSeed } from "@/components/ClockSeed";
import { ClockSync } from "@/components/ClockSync";
import { DetailsMenus } from "@/components/menu/DetailsMenus";
import { nowMs } from "@/lib/clock";
import { LiveProvider } from "@/components/LiveUpdates";
import { requireUser } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <LiveProvider>
      <div className="min-h-dvh">
        <ClockSeed serverNow={nowMs()} />
        <ClockSync />
        <DetailsMenus />
        <AppNav user={{ fullName: user.fullName, email: user.email, role: user.role }} view={user.view} />
        <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </LiveProvider>
  );
}
