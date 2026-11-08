"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markEmail, reopenEmail } from "@/app/actions/lead";
import { notifyLiveChange } from "@/components/LiveUpdates";
import { Icon } from "@/components/icons";

export function EmailMarkSentButton({
  leadId,
  toAddress,
  disabled,
}: {
  leadId: string;
  toAddress?: string | null;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkSent = () => {
    const formData = new FormData();
    formData.append("leadId", leadId);
    formData.append("status", "sent");
    if (toAddress) formData.append("to", toAddress);

    startTransition(async () => {
      await markEmail(formData);
      notifyLiveChange();
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={handleMarkSent}
      className="btn-primary btn-sm inline-flex items-center gap-1 font-medium disabled:opacity-50"
      title={disabled ? "Customer opted out of emails" : "Mark as sent"}
    >
      {isPending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Mark sent
        </>
      ) : (
        <>
          <Icon name="check" className="size-3.5" />
          Mark sent
        </>
      )}
    </button>
  );
}

export function EmailDraftedButton({
  leadId,
  toAddress,
}: {
  leadId: string;
  toAddress?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDrafted = () => {
    const formData = new FormData();
    formData.append("leadId", leadId);
    formData.append("status", "drafted");
    if (toAddress) formData.append("to", toAddress);

    startTransition(async () => {
      await markEmail(formData);
      notifyLiveChange();
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDrafted}
      className="btn-secondary btn-sm inline-flex items-center gap-1 font-medium disabled:opacity-50"
      title="Mark as drafted"
    >
      {isPending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Drafted
        </>
      ) : (
        "Drafted"
      )}
    </button>
  );
}

export function EmailReopenButton({
  leadId,
}: {
  leadId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleReopen = () => {
    const formData = new FormData();
    formData.append("leadId", leadId);

    startTransition(async () => {
      await reopenEmail(formData);
      notifyLiveChange();
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleReopen}
      className="btn-ghost btn-sm inline-flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-50"
      title="Move back to To Send"
    >
      {isPending ? (
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon name="history" className="size-3" />
      )}
      Reopen
    </button>
  );
}
