import { Badge, type Tone } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export type AuditCategory = "security" | "import" | "export" | "delete" | "data" | "other";

type ActionInfo = {
  label: string;
  tone: Tone;
  icon: IconName;
  category: AuditCategory;
};

export function getActionInfo(action: string): ActionInfo {
  // Security & Team / Auth
  if (action.startsWith("auth.") || action.startsWith("user.")) {
    if (action.includes("password")) {
      return { label: "Password Changed", tone: "amber", icon: "lock", category: "security" };
    }
    if (action === "user.created") {
      return { label: "User Created", tone: "brand", icon: "user", category: "security" };
    }
    if (action === "auth.failed") {
      return { label: "Login Failed", tone: "red", icon: "ban", category: "security" };
    }
    if (action === "auth.login") {
      return { label: "User Login", tone: "green", icon: "check", category: "security" };
    }
    return { label: formatActionLabel(action), tone: "brand", icon: "shield", category: "security" };
  }

  // Deletions & Rejections
  if (action.endsWith(".deleted") || action.endsWith(".rejected")) {
    return { label: formatActionLabel(action), tone: "red", icon: "trash", category: "delete" };
  }

  // Imports
  if (action.startsWith("import.")) {
    if (action === "import.approved") {
      return { label: "Import Approved", tone: "green", icon: "check", category: "import" };
    }
    return { label: formatActionLabel(action), tone: "green", icon: "upload", category: "import" };
  }

  // Exports
  if (action.startsWith("export.")) {
    return { label: formatActionLabel(action), tone: "sky", icon: "download", category: "export" };
  }

  // Research / AI
  if (action.startsWith("research.")) {
    return { label: formatActionLabel(action), tone: "amber", icon: "sparkles", category: "data" };
  }

  // Documents
  if (action.startsWith("document.")) {
    return { label: "Document Uploaded", tone: "violet", icon: "file", category: "data" };
  }

  return { label: formatActionLabel(action), tone: "slate", icon: "history", category: "other" };
}

function formatActionLabel(action: string): string {
  return action
    .replace(/^([a-z]+)\./i, "")
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditActionBadge({ action, showCode = true }: { action: string; showCode?: boolean }) {
  const info = getActionInfo(action);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge tone={info.tone} dot>
        <Icon name={info.icon} className="size-3" />
        <span>{info.label}</span>
      </Badge>
      {showCode && (
        <span className="font-mono text-[11px] text-muted tracking-tight" title={action}>
          {action}
        </span>
      )}
    </div>
  );
}
