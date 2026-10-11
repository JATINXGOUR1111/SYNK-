"use client";
import Link from "next/link";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { MasonryGrid } from "@/components/grids";
import { Avatar, EmptyState, ErrorState, GridSkeleton, Tabs, VerifiedTick } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { SavedRes } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/Providers";

export default function Saved() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<SavedRes>("/me/saved"), [user?.id]);
  const [tab, setTab] = useState<"posts" | "creators">("posts");
  const [col, setCol] = useState("");
  const posts = (data?.posts ?? []).filter((p) => !col || p.collection === col);
  const creators = (data?.creators ?? []).filter((c) => !col || c.collection === col);
  return (
    <AppShell requireAuth title="Saved">
      <h1 className="text-xl font-bold">Saved</h1>
      <div className="card overflow-hidden"><Tabs tabs={[{ id: "posts", label: "Posts" }, { id: "creators", label: "Creators" }]} value={tab} onChange={setTab} />
        {data && data.collections.length > 1 && <div className="hide-scroll flex gap-2 overflow-x-auto p-3" aria-label="Collections">
          {["", ...data.collections].map((c) => <button key={c || "all"} aria-pressed={col === c} onClick={() => setCol(c)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", col === c ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-slate-700")}>{c || "All collections"}</button>)}</div>}
        <div className="p-3">
          {loading ? <GridSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : tab === "posts" ? (posts.length ? <MasonryGrid posts={posts} /> : <EmptyState title="No saved posts" text="Tap the bookmark on any post to keep it here." icon="bookmark" action={<Link href="/explore" className="btn-primary">Explore</Link>} />)
            : creators.length ? <ul className="grid gap-2 sm:grid-cols-2">{creators.map((c) => <li key={c.id}><Link href={`/${c.handle}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><Avatar user={c} size={44} /><div className="min-w-0"><div className="flex items-center gap-1 truncate text-sm font-semibold">{c.name}{c.verified && <VerifiedTick />}</div><div className="muted truncate text-xs">{c.headline || `@${c.handle}`}</div></div></Link></li>)}</ul>
              : <EmptyState title="No saved creators" text="Save creators from their profile to build a shortlist." icon="user" />}
        </div></div>
    </AppShell>
  );
}
