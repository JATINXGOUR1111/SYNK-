"use client";
import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { cn, initials } from "@/lib/utils";
import { mediaUrl } from "@/lib/api";
import type { UserBrief } from "@/lib/types";

/* ---------- Icons (inline SVG, 24px grid) */
const P: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" /></>,
  bell: <><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 21a2 2 0 004 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" />,
  comment: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  share: <><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" /><path d="M16 6l-4-4-4 4M12 2v13" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z" />,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  play: <path d="M7 4l13 8-13 8V4z" />,
  pause: <path d="M7 4v16M17 4v16" />,
  mute: <><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></>,
  sound: <><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />,
  verified: <path d="M12 2l2.4 1.8 3-.2 1 2.8 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8-2.5-1.7.9-2.9-.9-2.9 2.5-1.7 1-2.8 3 .2L12 2z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  star: <path d="M12 2l3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9L12 2z" />,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  alert: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
};
export function Icon({ name, className, filled }: { name: keyof typeof P | string; className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5 shrink-0", className)} fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
  );
}

export function VerifiedTick({ className }: { className?: string }) {
  return (
    <span title="Verified" className={cn("inline-flex", className)}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-500" aria-label="Verified"><path fill="currentColor" d={(P.verified as { props: { d: string } }).props.d} /><path d="M8 12l3 3 5-6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

export function Avatar({ user, size = 40, ring, className }: { user: Pick<UserBrief, "name" | "avatar_url">; size?: number; ring?: boolean; className?: string }) {
  const s = { width: size, height: size };
  const [failed, setFailed] = useState(false);
  const body = user.avatar_url && !failed ? (
    <img src={mediaUrl(user.avatar_url)} alt={`${user.name}'s avatar`} style={s} onError={() => setFailed(true)} className="rounded-full bg-slate-200 object-cover dark:bg-slate-700" />
  ) : (
    <span style={{ ...s, fontSize: size / 2.6 }} className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 font-semibold text-white" aria-label={`${user.name}'s avatar`}>{initials(user.name)}</span>
  );
  if (!ring) return <span className={cn("inline-block shrink-0", className)}>{body}</span>;
  return (
    <span className={cn("story-ring inline-flex shrink-0 rounded-full p-[3px]", className)}>
      <span className="rounded-full bg-white p-[2px] dark:bg-ink-950">{body}</span>
    </span>
  );
}

export function RoleBadge({ role }: { role: "creator" | "brand" }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", role === "brand" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200")}>{role === "brand" ? "Brand" : "Creator"}</span>;
}

export function UserLink({ user, children, className }: { user: UserBrief; children?: ReactNode; className?: string }) {
  return <Link href={`/${user.handle}`} className={className}>{children ?? user.name}</Link>;
}

/* ---------- Skeletons */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} aria-hidden="true" />;
export function PostSkeleton() {
  return (
    <div className="card p-4" aria-busy="true" aria-label="Loading post">
      <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 !rounded-full" /><div className="space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-20" /></div></div>
      <Skeleton className="mt-4 aspect-[4/5] w-full" /><Skeleton className="mt-4 h-3 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-busy="true">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="card flex items-center gap-3 p-4"><Skeleton className="h-11 w-11 !rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
  ))}</div>;
}
export function GridSkeleton({ n = 9 }: { n?: number }) {
  return <div className="grid grid-cols-3 gap-1 sm:gap-2" aria-busy="true">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="aspect-square !rounded-lg" />)}</div>;
}

/* ---------- Empty / error states */
export function EmptyState({ title, text, action, icon = "sparkle" }: { title: string; text?: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <svg viewBox="0 0 120 90" className="mb-4 h-24 w-32" aria-hidden="true">
        <defs><linearGradient id="eg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#c026d3" /></linearGradient></defs>
        <rect x="14" y="14" width="70" height="56" rx="12" fill="url(#eg)" opacity=".15" /><rect x="36" y="26" width="70" height="56" rx="12" fill="url(#eg)" opacity=".3" />
        <circle cx="71" cy="54" r="14" fill="url(#eg)" />
      </svg>
      <div className="mb-1 flex items-center gap-2 text-base font-semibold"><Icon name={icon} className="h-4 w-4 text-violet-500" />{title}</div>
      {text && <p className="muted max-w-sm text-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center px-6 py-10 text-center">
      <Icon name="alert" className="mb-2 h-8 w-8 text-rose-500" />
      <p className="mb-3 text-sm font-medium">{message}</p>
      {onRetry && <button className="btn-outline btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} role="status" aria-label="Loading" />;
}

/* ---------- Modal */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-md animate-fade sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn("card !bg-white/95 dark:!bg-slate-900/95 max-h-[92vh] w-full animate-modalin overflow-y-auto rounded-b-none sm:rounded-b-[1.4rem]", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 py-3.5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} className={i <= Math.round(value) ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}><path fill="currentColor" d={(P.star as { props: { d: string } }).props.d} /></svg>
      ))}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex border-b border-slate-200/70 dark:border-white/10", className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("relative flex-1 px-3 py-3 text-sm font-semibold transition", value === t.id ? "text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400")}>
          {t.label}
          {value === t.id && <span className="absolute inset-x-5 bottom-0 h-[3px] rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_12px_rgba(168,85,247,.7)]" />}
        </button>
      ))}
    </div>
  );
}
