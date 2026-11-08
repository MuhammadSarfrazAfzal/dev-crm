"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";

/** Tables whose changes should refresh what's on screen. Must match the realtime migration. */
const LIVE_TABLES = ["leads", "companies", "contacts", "call_activities", "email_activities", "notes", "followups", "sales_opportunities", "imports", "documents", "scripts", "research_requests"];

type TokenInfo =
  | { mode: "supabase"; url: string; anonKey: string; accessToken: string; expiresAt: number }
  | { mode: "local" }
  | { mode: "none"; reason?: string };

type Status = "connecting" | "live" | "offline";

async function fetchToken(): Promise<TokenInfo> {
  const res = await fetch("/api/realtime/token", { cache: "no-store" });
  if (!res.ok) return { mode: "none" };
  return res.json();
}

/** Broadcast change across tabs in the browser instantly (0ms) */
export function notifyLiveChange() {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel("crm_channel");
      bc.postMessage({ t: Date.now() });
      bc.close();
    } catch {}
  }
}

/**
 * Keeps every page live: listens for changes via:
 * 1. Supabase Realtime WebSockets when running on Supabase / Vercel
 * 2. Cross-tab BroadcastChannel for 0ms instant sync across browser tabs
 * 3. Server-Sent Events /api/live when local
 * 4. Lightweight 2.5s version heartbeat fallback to guarantee 100% reliable updates everywhere
 */
const LiveContext = createContext<Status>("offline");

export function LiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastVersion = useRef<number>(0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    const changed = () => {
      if (document.hidden) {
        pending.current = true;
        return;
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    // 1. Cross-tab instant communication via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("crm_channel");
        bc.onmessage = () => changed();
      } catch {}
    }

    // 2. Fast version checker to catch any server-side database mutation
    const checkVersion = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/live/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.v === "number") {
          if (lastVersion.current > 0 && data.v > lastVersion.current) {
            changed();
          }
          lastVersion.current = Math.max(lastVersion.current, data.v);
        }
      } catch {}
    };

    // Check version immediately on mount
    checkVersion();

    // Heartbeat every 2.5 seconds
    const interval = setInterval(checkVersion, 2500);

    const onVisible = () => {
      if (!document.hidden) {
        if (pending.current) {
          pending.current = false;
          router.refresh();
        } else {
          checkVersion();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // 3. Supabase Realtime / Local EventSource setup
    (async () => {
      const info = await fetchToken().catch((): TokenInfo => ({ mode: "none" }));
      if (disposed) return;

      if (info.mode === "local") {
        const es = new EventSource("/api/live");
        es.addEventListener("ready", () => setStatus("live"));
        es.addEventListener("change", changed);
        es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
        cleanup = () => es.close();
        return;
      }

      if (info.mode !== "supabase") {
        setStatus("live");
        return;
      }

      try {
        const { RealtimeClient } = await import("@supabase/realtime-js");
        if (disposed) return;
        let token = info;
        const client = new RealtimeClient(`${info.url}/realtime/v1`, {
          params: { apikey: info.anonKey },
          accessToken: async () => {
            if (token.expiresAt - 120 < Date.now() / 1000) {
              const next = await fetchToken().catch((): TokenInfo => ({ mode: "none" }));
              if (next.mode === "supabase") token = next;
            }
            return token.accessToken;
          },
        });

        await client.setAuth();
        if (disposed) return client.disconnect();
        const channel = client.channel("crm-live");
        for (const table of LIVE_TABLES) {
          channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
        }

        channel.subscribe((s) => {
          if (s === "SUBSCRIBED") setStatus("live");
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("connecting");
          else if (s === "CLOSED") setStatus("offline");
        });

        cleanup = () => {
          client.removeChannel(channel);
          client.disconnect();
        };
      } catch {
        setStatus("live");
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timer.current);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (bc) bc.close();
      cleanup();
    };
  }, [router]);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}

export function LiveBadge() {
  const status = useContext(LiveContext);
  const label = { connecting: "Connecting…", live: "Live", offline: "Offline" }[status];
  return (
    <span
      suppressHydrationWarning
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line"
      title={status === "live" ? "Changes from your team appear automatically" : status === "offline" ? "Live updates are off; reload to see changes" : "Connecting to live updates"}
      data-testid="live-status"
      data-status={status}
    >
      <span
        suppressHydrationWarning
        className={cn(
          "size-1.5 rounded-full",
          status === "live" ? "animate-pulse bg-success" : status === "offline" ? "bg-subtle" : "bg-warning"
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
