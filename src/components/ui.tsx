import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg">
          <Icon name="arrowLeft" className="size-3.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium text-brand-fg">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight text-balance [overflow-wrap:anywhere] text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, icon, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: IconName; id?: string;
}) {
  return (
    <section className={cn("card", className)} id={id}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 text-muted"><Icon name={icon} /></span>}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(/(^|\s)p-\d/.test(bodyClassName ?? "") ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  slate: "bg-surface-3 text-fg-2 ring-line",
  brand: "bg-brand-soft text-brand-fg ring-brand-line",
  green: "bg-success-soft text-success-fg ring-success-line",
  amber: "bg-warning-soft text-warning-fg ring-warning-line",
  red: "bg-danger-soft text-danger-fg ring-danger-line",
  violet: "bg-accent-soft text-accent-fg ring-accent-line",
  sky: "bg-info-soft text-info-fg ring-info-line",
} as const;
export type Tone = keyof typeof TONES;

const DOTS: Record<Tone, string> = { slate: "bg-subtle", brand: "bg-brand", green: "bg-success", amber: "bg-warning", red: "bg-danger", violet: "bg-accent", sky: "bg-info" };

export function Badge({ tone = "slate", children, title, dot }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone])}>
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

const STAT_ACCENT: Record<Tone, string> = { slate: "text-muted", brand: "text-brand-fg", green: "text-success-fg", amber: "text-warning-fg", red: "text-danger-fg", violet: "text-accent-fg", sky: "text-info-fg" };
const STAT_ICON_BG: Record<Tone, string> = { slate: "bg-surface-3", brand: "bg-brand-soft", green: "bg-success-soft", amber: "bg-warning-soft", red: "bg-danger-soft", violet: "bg-accent-soft", sky: "bg-info-soft" };

export function Stat({ label, value, hint, href, tone = "slate", icon }: { label: string; value: number | string; hint?: string; href?: string; tone?: Tone; icon?: IconName }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && <span className={cn("rounded-md p-1.5", STAT_ICON_BG[tone], STAT_ACCENT[tone])}><Icon name={icon} className="size-3.5" /></span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</div>
      {hint && <div className={cn("mt-1 text-xs", tone === "red" ? "text-danger-fg" : "text-muted")}>{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:-translate-y-px hover:border-brand-line hover:shadow-pop">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export function EmptyState({ children, icon = "info", title, action }: { children?: ReactNode; icon?: IconName; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-4 py-10 text-center">
      <span className="mb-3 rounded-full bg-surface-3 p-2.5 text-muted"><Icon name={icon} className="size-5" /></span>
      {title && <div className="text-sm font-semibold text-fg">{title}</div>}
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ALERT_TONE = {
  amber: { cls: "border-warning-line bg-warning-soft text-warning-fg", icon: "alert" },
  red: { cls: "border-danger-line bg-danger-soft text-danger-fg", icon: "alert" },
  green: { cls: "border-success-line bg-success-soft text-success-fg", icon: "check" },
  sky: { cls: "border-info-line bg-info-soft text-info-fg", icon: "info" },
} as const;

export function Alert({ tone = "amber", children, title }: { tone?: keyof typeof ALERT_TONE; children: ReactNode; title?: ReactNode }) {
  const t = ALERT_TONE[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", t.cls)}>
      <Icon name={t.icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Which product something is for; nothing means both (shared scripts, deals for both). */
export function ProductBadge({ product }: { product: "pos" | "wholesale" | null }) {
  if (product === "pos") return <Badge tone="violet">8staros POS</Badge>;
  if (product === "wholesale") return <Badge tone="amber">Wholesale</Badge>;
  return <Badge>Both products</Badge>;
}

/** What a shop wants: each product it is interested in, marked when it has bought it. */
export function ProductTags({ interested, bought }: { interested: readonly string[]; bought: readonly string[] }) {
  return (
    <>
      {(["pos", "wholesale"] as const).filter((p) => interested.includes(p) || bought.includes(p)).map((p) =>
        bought.includes(p) ? (
          <Badge key={p} tone="green" title={`Bought ${p === "pos" ? "8staros POS" : "wholesale"}`}><Icon name="check" className="size-3" />{p === "pos" ? "8staros POS" : "Wholesale"} bought</Badge>
        ) : (
          <Badge key={p} tone={p === "pos" ? "violet" : "amber"} title={`Interested in ${p === "pos" ? "8staros POS" : "wholesale"}`}>Wants {p === "pos" ? "8staros POS" : "wholesale"}</Badge>
        ),
      )}
    </>
  );
}

/** A row of links that behaves like tabs or a segmented control. */
export function Segmented({ items, label }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5 text-sm" aria-label={label}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition", t.active ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-muted hover:text-fg")}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("rounded px-1 text-xs tabular-nums", t.active ? "bg-surface-3 text-fg-2" : "text-subtle")}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Label + value pairs for detail panels. */
export function DetailList({ items }: { items: { label: ReactNode; value: ReactNode; icon?: IconName }[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <dt className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
            {it.icon && <Icon name={it.icon} className="size-3.5" />}
            {it.label}
          </dt>
          <dd className="min-w-0 flex-1 text-sm break-words text-fg">{it.value ?? <span className="text-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Placeholder shown while a server component streams in. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} aria-hidden />;
}

/** Placeholder dash for missing values in tables. */
export const Dash = ({ label = "Not listed" }: { label?: string }) => <span className="text-subtle" title={label}>—</span>;

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const initials = (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
  return <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-fg ring-1 ring-brand-line", className)} aria-hidden>{initials}</span>;
}
