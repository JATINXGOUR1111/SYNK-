"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { MasonryGrid } from "@/components/grids";
import { Avatar, EmptyState, ErrorState, GridSkeleton, Icon, Stars, VerifiedTick } from "@/components/ui";
import { api } from "@/lib/api";
import { useInfinite } from "@/lib/hooks";
import type { CreatorCard, ExploreRes, Post, Trending } from "@/lib/types";
import { CATEGORY_OPTIONS, MEDIUMS, TOOL_OPTIONS, cn, inrShort } from "@/lib/utils";

function ExploreInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") ?? "";
  const medium = sp.get("medium") ?? "";
  const tool = sp.get("tool") ?? "";
  const category = sp.get("category") ?? "";
  const max_budget = sp.get("max_budget") ?? "";
  const max_turnaround = sp.get("max_turnaround") ?? "";
  const [text, setText] = useState(q);
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [parsed, setParsed] = useState<ExploreRes["parsed"]>(null);
  const [trend, setTrend] = useState<Trending | null>(null);
  useEffect(() => setText(q), [q]);
  useEffect(() => { api.get<Trending>("/tags/trending").then(setTrend).catch(() => undefined); }, []);

  function setParam(k: string, v: string) {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`/explore?${p.toString()}`);
  }
  const feed = useInfinite<Post>(async (cursor) => {
    const r = await api.get<ExploreRes>("/explore", { q, medium, tool, category, max_budget, max_turnaround, cursor });
    if (!cursor) { setCreators(r.creators); setParsed(r.parsed); }
    return { items: r.posts, next: r.next_cursor };
  }, [q, medium, tool, category, max_budget, max_turnaround]);

  function submit(e: FormEvent) { e.preventDefault(); setParam("q", text.trim()); }
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition", active ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 hover:border-violet-400 dark:border-slate-700");
  return (
    <>
      <form onSubmit={submit} role="search" className="relative">
        <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input value={text} onChange={(e) => setText(e.target.value)} className="input !rounded-full !py-3 !pl-11 !pr-24" aria-label="Search" placeholder="Try: cheerful 15-second reel for a skincare brand under 20k" />
        <button className="btn-primary btn-sm absolute right-2 top-1/2 -translate-y-1/2">Search</button>
      </form>
      <div className="card space-y-3 p-3" aria-label="Filters">
        <div className="hide-scroll flex gap-2 overflow-x-auto">
          {MEDIUMS.map((m) => <button key={m} aria-pressed={medium === m} className={chip(medium === m)} onClick={() => setParam("medium", medium === m ? "" : m)}>{m}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="Tool" className="input !py-2" value={tool} onChange={(e) => setParam("tool", e.target.value)}><option value="">Any tool</option>{TOOL_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Industry" className="input !py-2" value={category} onChange={(e) => setParam("category", e.target.value)}><option value="">Any industry</option>{CATEGORY_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Budget" className="input !py-2" value={max_budget} onChange={(e) => setParam("max_budget", e.target.value)}><option value="">Any budget</option>{[10000, 20000, 30000, 50000, 100000].map((n) => <option key={n} value={n}>Up to {inrShort(n)}</option>)}</select>
          <select aria-label="Turnaround" className="input !py-2" value={max_turnaround} onChange={(e) => setParam("max_turnaround", e.target.value)}><option value="">Any turnaround</option>{[2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>Within {n} days</option>)}</select>
        </div>
        {parsed && q && <p className="muted text-xs"><Icon name="sparkle" className="mr-1 inline h-3 w-3 text-violet-500" />Understood as: {Object.entries(parsed.filters).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `${k.replace(/_/g, " ")} ${String(v)}`).join(" · ") || "no filters"}</p>}
      </div>
      {!q && trend && trend.tags.length > 0 && (
        <div className="hide-scroll flex gap-2 overflow-x-auto" aria-label="Trending hashtags">{trend.tags.map((t) => <Link key={t.tag} href={`/tag/${t.tag}`} className="chip shrink-0">#{t.tag}</Link>)}</div>)}
      {creators.length > 0 && (
        <section aria-label="Creators"><h2 className="mb-2 text-sm font-semibold">Creators</h2>
          <div className="hide-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">{creators.map((c) => (
            <Link key={c.user.id} href={`/${c.user.handle}`} className="card w-44 shrink-0 p-3 text-center transition hover:-translate-y-0.5">
              <Avatar user={c.user} size={56} className="mx-auto" />
              <div className="mt-2 flex items-center justify-center gap-1 truncate text-sm font-semibold">{c.user.name}{c.user.verified && <VerifiedTick />}</div>
              <div className="muted truncate text-xs">{c.tools?.slice(0, 2).join(", ")}</div>
              <div className="mt-1 flex items-center justify-center gap-2 text-xs">{c.rating ? <Stars value={c.rating} size={12} /> : null}{c.match_pct !== null && <span className="font-bold text-violet-600 dark:text-violet-300">{c.match_pct}% match</span>}</div>
            </Link>))}</div></section>)}
      <section aria-label="Posts">
        <MasonryGrid posts={feed.items} />
        {feed.loading && <GridSkeleton />}
        {feed.error && <ErrorState message={feed.error} onRetry={feed.retry} />}
        {!feed.loading && !feed.error && feed.items.length === 0 && <EmptyState title="No results" text="Try fewer filters or a different phrase." action={<button className="btn-outline" onClick={() => router.replace("/explore")}>Clear filters</button>} />}
        <div ref={feed.sentinel} className="h-1" />
      </section>
    </>
  );
}

export default function ExplorePage() {
  return <AppShell title="Explore"><Suspense fallback={<GridSkeleton />}><ExploreInner /></Suspense></AppShell>;
}
