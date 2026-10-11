"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { MasonryGrid } from "@/components/grids";
import { Avatar, EmptyState, ErrorState, GridSkeleton, VerifiedTick } from "@/components/ui";
import { api } from "@/lib/api";
import { useInfinite } from "@/lib/hooks";
import type { Post, UserBrief } from "@/lib/types";
import { useState } from "react";

interface TagRes { tag: string; total: number; posts: Post[]; creators: { user: UserBrief; posts: number }[]; next_cursor: string | null }

export default function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const [top, setTop] = useState<TagRes["creators"]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const feed = useInfinite<Post>(async (cursor) => {
    const r = await api.get<TagRes>(`/tags/${encodeURIComponent(tag)}`, { cursor });
    if (!cursor) { setTop(r.creators); setTotal(r.total); }
    return { items: r.posts, next: r.next_cursor };
  }, [tag]);
  return (
    <AppShell title={`#${tag}`}>
      <header className="card p-5"><h1 className="text-2xl font-bold">#{tag}</h1><p className="muted text-sm">{total === null ? "Loading…" : `${total} post${total === 1 ? "" : "s"}`}</p></header>
      {top.length > 0 && (
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Top creators</h2>
          <div className="hide-scroll flex gap-4 overflow-x-auto">{top.map((c) => (
            <Link key={c.user.id} href={`/${c.user.handle}`} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center"><Avatar user={c.user} size={52} /><span className="flex w-full items-center justify-center gap-0.5 truncate text-xs font-medium">{c.user.name.split(" ")[0]}{c.user.verified && <VerifiedTick />}</span></Link>))}</div></section>)}
      <MasonryGrid posts={feed.items} />
      {feed.loading && <GridSkeleton />}
      {feed.error && <ErrorState message={feed.error} onRetry={feed.retry} />}
      {!feed.loading && !feed.error && feed.items.length === 0 && <EmptyState title="No posts with this tag yet" text="Be the first to use it." />}
      <div ref={feed.sentinel} className="h-1" />
    </AppShell>
  );
}
