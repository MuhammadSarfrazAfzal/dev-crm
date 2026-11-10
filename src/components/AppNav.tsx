"use client";

import Link from "next/link";
import { FEATURES } from "@/lib/features";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Icon, type IconName } from "./icons";
import { LiveBadge } from "./LiveUpdates";
import { ThemeToggle } from "./ThemeToggle";
import { TimeViewToggle } from "./TimeViewToggle";
import type { TimeView } from "@/lib/time";
import { Avatar, cn } from "./ui";

type Item = { href: string; label: string; icon: IconName; adminOnly?: boolean; badge?: string };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/leads", label: "Leads", icon: "leads" },
      { href: "/companies", label: "Companies", icon: "companies" },
      { href: "/whatsapp", label: "WhatsApp to send", icon: "whatsapp" },
      { href: "/emails", label: "Emails to send", icon: "mail" },
      { href: "/callbacks", label: "Call back later", icon: "phone" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/imports", label: "Import", icon: "upload" },
      ...(FEATURES.researchAgent ? [{ href: "/research", label: "Research agent", icon: "sparkles" as const, badge: "Setup" }] : []),
    ],
  },
  { label: "Selling", items: [{ href: "/scripts", label: "Scripts", icon: "script" }] },
  {
    label: "Manage",
    items: [
      { href: "/reports", label: "Reports", icon: "chart", adminOnly: true },
      { href: "/team", label: "Team", icon: "team", adminOnly: true },
      { href: "/audit", label: "Audit log", icon: "shield", adminOnly: true },
    ],
  },
];

export function AppNav({ user, view }: { user: { fullName: string; email: string; role: string }; view: TimeView }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leadsHref, setLeadsHref] = useState("/leads");
  const [companiesHref, setCompaniesHref] = useState("/companies");

  // Keep track of active lead/company table pages across navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (pathname === "/leads") {
      const search = window.location.search;
      const full = `/leads${search}`;
      sessionStorage.setItem("crm_last_leads_href", full);
      setLeadsHref(full);
    } else if (pathname.startsWith("/leads/")) {
      const search = window.location.search;
      if (search) {
        const full = `/leads${search}`;
        sessionStorage.setItem("crm_last_leads_href", full);
        setLeadsHref(full);
      } else {
        const saved = sessionStorage.getItem("crm_last_leads_href");
        if (saved) setLeadsHref(saved);
      }
    } else {
      const saved = sessionStorage.getItem("crm_last_leads_href");
      if (saved) setLeadsHref(saved);
    }

    if (pathname === "/companies") {
      const search = window.location.search;
      const full = `/companies${search}`;
      sessionStorage.setItem("crm_last_companies_href", full);
      setCompaniesHref(full);
    } else if (pathname.startsWith("/companies/")) {
      const search = window.location.search;
      if (search) {
        const full = `/companies${search}`;
        sessionStorage.setItem("crm_last_companies_href", full);
        setCompaniesHref(full);
      } else {
        const saved = sessionStorage.getItem("crm_last_companies_href");
        if (saved) setCompaniesHref(saved);
      }
    } else {
      const saved = sessionStorage.getItem("crm_last_companies_href");
      if (saved) setCompaniesHref(saved);
    }
  }, [pathname]);

  // The phone menu closes on Escape, like every other menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || user.role === "admin") })).filter((g) => g.items.length);

  const links = (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-subtle uppercase">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const itemHref = item.href === "/leads" ? leadsHref : item.href === "/companies" ? companiesHref : item.href;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={itemHref}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active ? "bg-brand-soft text-brand-fg" : "text-muted hover:bg-surface-3 hover:text-fg",
                    )}
                  >
                    <Icon name={item.icon} className={cn("size-4 shrink-0", active ? "text-brand-fg" : "text-subtle group-hover:text-fg")} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && <span className="rounded bg-surface-3 px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase">{item.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  const account = (
    <div className="border-t border-line pt-3">
      <div className="flex items-center gap-2.5 px-2">
        <Avatar name={user.fullName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{user.fullName}</div>
          <div className="truncate text-xs text-muted">{user.role === "admin" ? "Admin" : "Salesperson"} · {user.email}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 px-2">
        <span className="text-xs text-muted">Show times in</span>
        <TimeViewToggle view={view} />
      </div>
      <div className="mt-2 flex items-center gap-1 px-1">
        <Link href="/settings" onClick={() => setOpen(false)} className="btn-ghost btn-sm" aria-label="Settings"><Icon name="settings" className="size-3.5" /> Settings</Link>
        <form action={logout}>
          <button type="submit" className="btn-ghost btn-sm"><Icon name="logout" className="size-3.5" /> Sign out</button>
        </form>
        <span className="ml-auto"><ThemeToggle /></span>
      </div>
    </div>
  );

  const brand = (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 px-1 sm:px-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-white shadow-sm">
        <Icon name="star" className="size-4.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 truncate text-sm leading-tight font-semibold text-fg">
        Devsolutionspk Sales CRM
        <span className="block truncate text-[11px] font-normal text-muted">POS Development</span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="flex items-center justify-between gap-2 pr-1">{brand}<LiveBadge /></div>
        <nav className="flex-1 overflow-y-auto" aria-label="Main">{links}</nav>
        {account}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/90 px-3 py-2 backdrop-blur lg:hidden">
        {brand}
        <div className="flex shrink-0 items-center gap-1.5">
          <LiveBadge />
          <button type="button" className="btn-ghost px-2" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
            <span className="sr-only">Menu</span>
            <Icon name={open ? "x" : "menu"} className="size-5" />
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 top-[53px] bottom-0 z-20 overflow-y-auto border-b border-line bg-surface px-3 py-4 lg:hidden">
          <nav aria-label="Main">{links}</nav>
          <div className="mt-5">{account}</div>
        </div>
      )}
    </>
  );
}
