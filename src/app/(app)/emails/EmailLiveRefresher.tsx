"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ensures Emails to send page receives real-time updates:
 * Listens for focus/visibility changes and periodically checks for email queue updates.
 */
export function EmailLiveRefresher() {
  const router = useRouter();

  useEffect(() => {
    // Refresh when user returns to tab
    const handleFocus = () => {
      router.refresh();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    // Heartbeat check every 12 seconds
    const interval = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
      }
    }, 12000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
