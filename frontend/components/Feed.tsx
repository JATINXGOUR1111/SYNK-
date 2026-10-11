"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FeedPage, Post } from "@/lib/types";
import { useInfinite } from "@/lib/hooks";
import { useAuth } from "./Providers";
import PostCard from "./PostCard";
import StoriesRow from "./Stories";
import { EmptyState, ErrorState, PostSkeleton, Tabs } from "./ui";
import Link from "next/link";

type Tab = "for_you" | "following" | "briefs";

export default function Feed() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("for_you");
  const feed = useInfinite<Post>(async (cursor) => {
    const r = await api.get<FeedPage>("/feed", { tab, cursor, limit: 8 });
    return { items: r.items, next: r.next_cursor };
  }, [tab, user?.id]);

  // show your own new post at the top of For You immediately
  useEffect(() => {
    const h = (e: Event) => { const p = (e as CustomEvent<Post>).detail; if (tab === "for_you") feed.setItems((x) => [p, ...x]); };
    window.addEventListener("cm:posted", h);
    return () => window.removeEventListener("cm:posted", h);
  }, [tab, feed]);

  const tabs: { id: Tab; label: string }[] = [{ id: "for_you", label: "For You" }, ...(user ? [{ id: "following" as Tab, label: "Following" }, { id: "briefs" as Tab, label: user.role === "creator" ? "Briefs" : "Creators" }] : [])];
  return (
    <div className="space-y-4">
      <StoriesRow />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} className="card overflow-hidden !border-b-0" />}
      {feed.items.map((p) => <PostCard key={p.id} post={p} onDeleted={(id) => feed.setItems((x) => x.filter((y) => y.id !== id))} />)}
      {feed.loading && (feed.items.length === 0 ? <><PostSkeleton /><PostSkeleton /></> : <PostSkeleton />)}
      {feed.error && <ErrorState message={feed.error} onRetry={feed.retry} />}
      {!feed.loading && !feed.error && feed.items.length === 0 && (
        tab === "following" ? <EmptyState title="Your following feed is empty" text="Follow creators to see their latest work in chronological order." action={<Link href="/explore" className="btn-primary">Explore creators</Link>} />
          : <EmptyState title="Nothing here yet" text="Check back soon or explore what is trending." action={<Link href="/explore" className="btn-primary">Explore</Link>} />)}
      {feed.done && feed.items.length > 0 && <p className="muted py-6 text-center text-sm">You are all caught up.</p>}
      <div ref={feed.sentinel} className="h-1" />
    </div>
  );
}
