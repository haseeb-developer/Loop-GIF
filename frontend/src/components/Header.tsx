"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { bytes } from "@/lib/format";
import { LinkButton, Menu, cx } from "./ui";
import { ClockIcon, LogoutIcon, PlusIcon } from "./icons";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
        <path d="M9 16a7 7 0 1 1 7 7" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="23" r="2" fill="var(--color-accent)" />
      </svg>
      Loop
    </Link>
  );
}

function Usage({ label, used, total }: { label: string; used: number; total?: number }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs"><span className="text-dim">{label}</span>
        <span className="font-mono text-fg">{bytes(used)}{total ? ` / ${bytes(total)}` : ""}</span></div>
      {total ? <div className="h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const nav = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} aria-current={match(path) ? "page" : undefined}
      className={cx("relative rounded-md px-3 py-1.5 text-sm transition duration-150", match(path) ? "text-fg" : "text-dim hover:text-fg")}>
      {label}
      {match(path) && <span className="absolute inset-x-3 -bottom-[13px] h-px bg-accent" />}
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Logo href="/dashboard" />
        <nav className="ml-1 flex items-center" aria-label="Main">
          {nav("/dashboard", "Library", (p) => p.startsWith("/dashboard") || p.startsWith("/gifs"))}
          {nav("/new", "Create", (p) => p.startsWith("/new"))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LinkButton href="/new" variant="primary" size="sm" className="hidden sm:inline-flex"><PlusIcon />New GIF</LinkButton>
          {user && (
            <Menu label="Account" align="right"
              icon={<span className="grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-raised text-xs font-medium">
                {user.display_name.slice(0, 1).toUpperCase()}</span>}
              header={
                <div className="space-y-3 border-b border-line px-2.5 pb-3 pt-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{user.display_name}</p>
                    <p className="truncate text-xs text-dim">{user.email}</p></div>
                  <Usage label="GIFs" used={user.storage_bytes} />
                  <Usage label="Source videos" used={user.source_bytes} total={user.source_quota_bytes} />
                </div>}
              items={[
                { label: "Library", icon: <ClockIcon />, href: "/dashboard" },
                { label: "New GIF", icon: <PlusIcon />, href: "/new" },
                "separator",
                { label: "Sign out", icon: <LogoutIcon />, onClick: async () => { await logout(); router.replace("/login"); } },
              ]} />
          )}
        </div>
      </div>
    </header>
  );
}
