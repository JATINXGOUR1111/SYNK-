"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { Avatar, Icon, RoleBadge, VerifiedTick, Skeleton } from "./ui";
import ThemeToggle from "./ThemeToggle";
import Composer from "./Composer";
import { FollowButton } from "./social";
import { api } from "@/lib/api";
import { cn, budgetLabel } from "@/lib/utils";
import type { Brief, CreatorCard, Trending, UserBrief } from "@/lib/types";

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 px-2" aria-label="CreatorMatch home">
      <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow">
        <Icon name="sparkle" className="h-5 w-5" /><span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />
      </span>
      {!compact && <span className="text-[19px] font-bold tracking-tight">Creator<span className="gradient-text">Match</span></span>}
    </Link>
  );
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white" aria-label={`${n} unread`}>{n > 9 ? "9+" : n}</span>;
}

function RightSidebar() {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState<UserBrief[] | null>(null);
  const [trend, setTrend] = useState<Trending | null>(null);
  const [side, setSide] = useState<{ briefs?: Brief[]; creators?: CreatorCard[] } | null>(null);
  useEffect(() => {
    api.get<UserBrief[]>("/users/suggested").then(setSugg).catch(() => setSugg([]));
    api.get<Trending>("/tags/trending").then(setTrend).catch(() => setTrend({ tags: [], tools: [] }));
    if (user?.role === "creator") api.get<Brief[]>("/briefs").then((b) => setSide({ briefs: b.slice(0, 3) })).catch(() => setSide({ briefs: [] }));
    else api.get<{ items: CreatorCard[] }>("/creators", { limit: 4 }).then((r) => setSide({ creators: r.items })).catch(() => setSide({ creators: [] }));
  }, [user?.role, user?.id]);
  function submit(e: FormEvent) { e.preventDefault(); if (q.trim()) router.push(`/explore?q=${encodeURIComponent(q.trim())}`); }
  return (
    <aside className="sticky top-0 hidden h-screen w-[22rem] shrink-0 space-y-4 overflow-y-auto py-5 pl-4 pr-2 xl:block hide-scroll" aria-label="Sidebar">
      <form onSubmit={submit} role="search" className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input !rounded-full !pl-9" placeholder="Search creators, e.g. cheerful skincare reel under 20k" aria-label="Search creators" />
      </form>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Suggested creators</h2>
        {sugg === null ? <Skeleton className="h-32" /> : sugg.length === 0 ? <p className="muted text-sm">No suggestions yet.</p> : (
          <ul className="space-y-3">{sugg.slice(0, 5).map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Link href={`/${u.handle}`}><Avatar user={u} size={36} /></Link>
              <Link href={`/${u.handle}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-semibold">{u.name}{u.verified && <VerifiedTick />}</div>
                <div className="muted truncate text-xs">{u.headline || `@${u.handle}`}</div>
              </Link>
              <FollowButton userId={u.id} following={false} />
            </li>))}</ul>)}
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Trending tools and tags</h2>
        {trend === null ? <Skeleton className="h-20" /> : (
          <div className="flex flex-wrap gap-1.5">
            {trend.tools.slice(0, 4).map((t) => <Link key={t.tool} href={`/explore?tool=${encodeURIComponent(t.tool)}`} className="chip-accent">{t.tool}</Link>)}
            {trend.tags.slice(0, 8).map((t) => <Link key={t.tag} href={`/tag/${t.tag}`} className="chip">#{t.tag}</Link>)}
            {!trend.tags.length && !trend.tools.length && <p className="muted text-sm">Nothing trending yet.</p>}
          </div>)}
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">{user?.role === "creator" ? "Open briefs" : "Rising creators"}</h2>
        {side === null ? <Skeleton className="h-24" /> : user?.role === "creator" ? (
          side.briefs?.length ? <ul className="space-y-3">{side.briefs.map((b) => (
            <li key={b.id}><Link href={`/briefs/${b.id}`} className="block rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <div className="truncate text-sm font-semibold">{b.title}</div>
              <div className="muted flex gap-2 text-xs">{budgetLabel(b.structured.budget_range_inr) && <span>{budgetLabel(b.structured.budget_range_inr)}</span>}{b.fit != null && <span className="font-semibold text-violet-600 dark:text-violet-300">{b.fit}% fit</span>}</div>
            </Link></li>))}</ul> : <p className="muted text-sm">No open briefs right now.</p>
        ) : side.creators?.length ? <ul className="space-y-3">{side.creators.map((c) => (
          <li key={c.user.id}><Link href={`/${c.user.handle}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <Avatar user={c.user} size={34} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{c.user.name}</div><div className="muted truncate text-xs">{c.profile?.tools.slice(0, 2).join(", ")}</div></div></Link></li>))}</ul>
          : <p className="muted text-sm">No creators yet.</p>}
      </section>
      <p className="muted px-2 text-xs">CreatorMatch · AI-native marketplace for AI creators</p>
    </aside>
  );
}

export default function AppShell({ children, wide, requireAuth, title }: { children: ReactNode; wide?: boolean; requireAuth?: boolean; title?: string }) {
  const { user, loading, counts, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [composer, setComposer] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { if (requireAuth && !loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [requireAuth, loading, user, router, path]);
  useEffect(() => { if (title) document.title = `${title} · CreatorMatch`; }, [title]);

  const isBrand = user?.role === "brand";
  const nav = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/explore", label: "Explore", icon: "search" },
    ...(user ? [{ href: "/briefs", label: isBrand ? "Briefs" : "Opportunities", icon: "briefcase" }] : []),
    ...(user ? [{ href: "/notifications", label: "Notifications", icon: "bell", badge: counts.notifications }] : []),
    ...(user ? [{ href: "/messages", label: "Messages", icon: "mail", badge: counts.messages }] : []),
    ...(user ? [{ href: "/saved", label: "Saved", icon: "bookmark" }, { href: `/${user.handle}`, label: "Profile", icon: "user" }] : []),
  ];
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  function ctaPost() { if (!user) router.push("/register"); else if (isBrand) router.push("/briefs/new"); else setComposer(true); }

  if (requireAuth && (loading || !user)) return <div className="flex min-h-screen items-center justify-center"><Skeleton className="h-10 w-40" /></div>;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1280px] justify-center">
      {/* left rail: icons on tablet, full on desktop */}
      <header className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col justify-between px-3 py-5 md:flex lg:w-72 lg:px-5">
        <div className="space-y-1">
          <div className="mb-6 hidden lg:block"><Logo /></div>
          <div className="mb-4 flex justify-center lg:hidden"><Logo compact /></div>
          <nav aria-label="Main" className="glass space-y-1 rounded-3xl p-2 shadow-soft">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-label={n.label} aria-current={active(n.href) ? "page" : undefined}
                className={cn("nav-item", active(n.href) && "nav-item-active")}>
                <span className="relative"><Icon name={n.icon} className={cn("h-6 w-6", active(n.href) && "text-violet-600 dark:text-violet-400")} filled={active(n.href) && ["home", "bookmark"].includes(n.icon)} />{"badge" in n && <Badge n={n.badge ?? 0} />}</span>
                <span className="hidden lg:inline">{n.label}</span>
              </Link>))}
          </nav>
          <button className="btn-primary mt-5 w-full !py-3 max-lg:!px-0" onClick={ctaPost} aria-label={isBrand ? "New brief" : "New post"}>
            <Icon name="plus" /><span className="hidden lg:inline">{isBrand ? "New Brief" : "Post"}</span>
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1 lg:justify-start"><ThemeToggle />{user && <Link href="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" /></Link>}</div>
          {user ? (
            <div className="glass flex items-center gap-3 rounded-2xl p-2 max-lg:justify-center">
              <Avatar user={user} size={36} />
              <div className="hidden min-w-0 flex-1 lg:block"><div className="truncate text-sm font-semibold">{user.name}</div><RoleBadge role={user.role} /></div>
              <button className="icon-btn hidden lg:inline-flex" onClick={logout} aria-label="Log out"><Icon name="logout" /></button>
            </div>
          ) : (
            <div className="hidden space-y-2 lg:block"><Link href="/login" className="btn-outline w-full">Log in</Link><Link href="/register" className="btn-primary w-full">Sign up</Link></div>
          )}
        </div>
      </header>

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full min-w-0 justify-center">
          {/* mobile top bar */}
          <div className={cn("w-full min-w-0 px-0 pb-28 md:pb-8 sm:px-4", wide ? "max-w-[960px]" : "max-w-[640px]")}>
            <div className="glass sticky top-0 z-30 flex items-center gap-2 border-x-0 border-t-0 px-3 py-2.5 md:hidden">
              <Logo />
              <form className="relative flex-1" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/explore?q=${encodeURIComponent(q.trim())}`); }}>
                <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} className="input !rounded-full !py-2 !pl-9" placeholder="Search" aria-label="Search" />
              </form>
              <ThemeToggle />
            </div>
            <main className="space-y-4 px-3 py-4 sm:px-0 md:py-6">{children}</main>
          </div>
          {!wide && <RightSidebar />}
        </div>
      </div>

      {/* mobile bottom tab bar */}
      <nav aria-label="Primary" className="glass pb-safe fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-[1.6rem] px-2 py-1.5 shadow-[0_18px_40px_-12px_rgba(40,20,100,.45)] md:hidden">
        <Link href="/" aria-label="Home" className="icon-btn !h-11 !w-11"><Icon name="home" className={cn("h-6 w-6", active("/") && "text-violet-600")} filled={active("/")} /></Link>
        <Link href="/explore" aria-label="Explore" className="icon-btn !h-11 !w-11"><Icon name="search" className={cn("h-6 w-6", active("/explore") && "text-violet-600")} /></Link>
        <button onClick={ctaPost} aria-label={isBrand ? "New brief" : "New post"} className="btn-primary !h-12 !w-12 !rounded-2xl !p-0"><Icon name="plus" className="h-6 w-6" /></button>
        <Link href={user ? "/notifications" : "/login"} aria-label="Notifications" className="icon-btn relative !h-11 !w-11"><Icon name="bell" className={cn("h-6 w-6", active("/notifications") && "text-violet-600")} /><Badge n={counts.notifications} /></Link>
        <Link href={user ? `/${user.handle}` : "/login"} aria-label="Profile" className="icon-btn !h-11 !w-11">{user ? <Avatar user={user} size={28} /> : <Icon name="user" className="h-6 w-6" />}</Link>
      </nav>

      <Composer open={composer} onClose={() => setComposer(false)} />
    </div>
  );
}
