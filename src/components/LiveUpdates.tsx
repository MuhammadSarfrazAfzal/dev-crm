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
 * Keeps every page live across desktop and mobile:
 * 1. Immediate "live" HTTP sync via /api/live/version + focus/visibility detection
 * 2. Cross-tab BroadcastChannel for 0ms instant sync across browser tabs
 * 3. Best-effort Supabase Realtime WebSockets (or local SSE) without blocking or getting stuck on mobile networks
 */
const LiveContext = createContext<Status>("live");

export function LiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [status, setStatus] = useState<Status>("live");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastVersion = useRef<number>(0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
    } else {
      setStatus("live");
    }

    const changed = () => {
      if (document.hidden) {
        pending.current = true;
        return;
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => routerRef.current.refresh(), 300);
    };

    // 1. Cross-tab instant communication via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("crm_channel");
        bc.onmessage = () => changed();
      } catch {}
    }

    // 2. Reliable HTTPS version checker for desktop and mobile networks
    const checkVersion = async () => {
      if (document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus("offline");
        return;
      }
      try {
        const res = await fetch("/api/live/version", { cache: "no-store" });
        if (!res.ok) return;
        setStatus("live");
        const data = await res.json();
        if (typeof data.v === "number" && data.v > 0) {
          if (lastVersion.current > 0 && data.v > lastVersion.current) {
            changed();
          }
          lastVersion.current = Math.max(lastVersion.current, data.v);
        }
      } catch {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus("offline");
        }
      }
    };

    checkVersion();
    const interval = setInterval(() => {
      if (!document.hidden) checkVersion();
    }, 20_000);

    const onVisible = () => {
      if (!document.hidden) {
        if (typeof navigator === "undefined" || navigator.onLine !== false) {
          setStatus("live");
        }
        if (pending.current) {
          pending.current = false;
          routerRef.current.refresh();
        } else {
          checkVersion();
        }
      }
    };

    const onOnline = () => {
      setStatus("live");
      checkVersion();
    };
    const onOffline = () => {
      setStatus("offline");
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // 3. Best-effort Supabase Realtime / Local EventSource enhancement
    (async () => {
      const info = await fetchToken().catch((): TokenInfo => ({ mode: "none" }));
      if (disposed) return;

      if (info.mode === "local") {
        const es = new EventSource("/api/live");
        es.addEventListener("ready", () => setStatus("live"));
        es.addEventListener("change", changed);
        es.onerror = () => {
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setStatus("offline");
          }
        };
        cleanup = () => es.close();
        return;
      }

      if (info.mode !== "supabase") {
        setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "live");
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
          if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            if (typeof navigator === "undefined" || navigator.onLine !== false) {
              setStatus("live");
            }
          }
        });

        cleanup = () => {
          client.removeChannel(channel);
          client.disconnect();
        };
      } catch {
        if (typeof navigator === "undefined" || navigator.onLine !== false) {
          setStatus("live");
        }
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timer.current);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (bc) bc.close();
      cleanup();
    };
  }, []);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}

export function LiveBadge() {
  const status = useContext(LiveContext);
  const label = { connecting: "Connecting…", live: "Live", offline: "Offline" }[status];
  return (
    <span
      suppressHydrationWarning
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line"
      title={status === "live" ? "Changes from your team appear automatically" : status === "offline" ? "You appear to be offline; reconnect to sync" : "Connecting to live updates"}
      data-testid="live-status"
      data-status={status}
    >
      <span
        suppressHydrationWarning
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status === "live" ? "animate-pulse bg-success" : status === "offline" ? "bg-subtle" : "bg-warning"
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
