"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ensures WhatsApp to send page receives real-time updates:
 * Listens for focus/visibility changes and periodically checks for new logged calls.
 */
export function WhatsAppLiveRefresher() {
  const router = useRouter();

  useEffect(() => {
    // Refresh when user returns to tab
    const handleFocus = () => {
      if (!document.hidden) {
        router.refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [router]);

  return null;
}

