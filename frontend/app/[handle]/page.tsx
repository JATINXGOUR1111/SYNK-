"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ProfileHeader from "@/components/ProfileHeader";
import { SquareGrid } from "@/components/grids";
import { AudioPlayer } from "@/components/media";
import PostCard from "@/components/PostCard";
import { Avatar, EmptyState, ErrorState, GridSkeleton, ListSkeleton, Skeleton, Stars, Tabs } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/components/Providers";
import type { Post, Review, UserFull } from "@/lib/types";
import { inr, timeAgo, cn } from "@/lib/utils";

type Tab = "portfolio" | "videos" | "audio" | "reviews" | "about" | "briefs";

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user } = useAuth();
  const { data: u, setData, loading, error, reload } = useFetch(() => api.get<UserFull>(`/users/${handle}`), [handle, user?.id]);
  const posts = useFetch(() => api.get<{ items: Post[] }>(`/users/${handle}/posts`, { limit: 60 }), [handle, user?.id]);
  const reviews = useFetch(() => (u && u.role === "creator" ? api.get<Review[]>(`/creators/${u.id}/reviews`) : Promise.resolve([] as Review[])), [u?.id]);
  const [tab, setTab] = useState<Tab>("portfolio");
  const [hl, setHl] = useState<string | null>(null);
  useEffect(() => { setTab(u?.role === "brand" ? "briefs" : "portfolio"); setHl(null); }, [u?.role, handle]);

  const work = useMemo(() => (posts.data?.items ?? []).filter((p) => p.kind === "work"), [posts.data]);
  const highlights = useMemo(() => {
    if (!u?.profile) return [];
    const out: { name: string; posts: Post[] }[] = u.profile.categories.map((c) => ({ name: c, posts: work.filter((p) => (p.tags.industry_fit ?? []).includes(c) || p.caption.toLowerCase().includes(c)) }));
    const reels = work.filter((p) => p.media[0]?.type === "video");
    if (reels.length) out.push({ name: "reels", posts: reels });
    return out.filter((h) => h.posts.length);
  }, [u, work]);
  const shown = hl ? highlights.find((h) => h.name === hl)?.posts ?? [] : work;

  const tabs: { id: Tab; label: string }[] = u?.role === "brand"
    ? [{ id: "briefs", label: "Briefs & posts" }, { id: "about", label: "About" }]
    : [{ id: "portfolio", label: "Portfolio" }, { id: "videos", label: "Videos" }, { id: "audio", label: "Audio" }, { id: "reviews", label: "Reviews" }, { id: "about", label: "About" }];
  const p = u?.profile;
  return (
    <AppShell title={u ? u.name : "Profile"}>
      {loading ? <><Skeleton className="h-72" /><GridSkeleton /></> : error || !u ? <ErrorState message={error ?? "Profile not found"} onRetry={reload} /> : (
        <>
          <ProfileHeader u={u} onFollowChange={(f) => setData({ ...u, is_following: f, stats: { ...u.stats, followers: u.stats.followers + (f ? 1 : -1) } })} onUpdated={(patch) => setData({ ...u, ...patch })} />
          {u.role === "creator" && highlights.length > 0 && (
            <div className="card hide-scroll flex gap-4 overflow-x-auto p-3" aria-label="Highlights">
              <button className="flex w-16 shrink-0 flex-col items-center gap-1" aria-pressed={hl === null} onClick={() => setHl(null)}><span className={cn("flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-semibold", hl === null ? "border-violet-500" : "border-slate-300 dark:border-slate-700")}>All</span><span className="text-xs">All</span></button>
              {highlights.map((h) => (
                <button key={h.name} className="flex w-16 shrink-0 flex-col items-center gap-1" aria-pressed={hl === h.name} onClick={() => { setHl(h.name); setTab("portfolio"); }}>
                  <span className={cn("h-14 w-14 overflow-hidden rounded-full border-2 bg-slate-200 dark:bg-slate-800", hl === h.name ? "border-violet-500" : "border-slate-300 dark:border-slate-700")}>{(() => { const m = h.posts.map((x) => x.media[0]).find((x) => x?.type === "image"); const v = h.posts[0].media[0]; const src = m ? m.url : v?.type === "video" && /clip_\d\.mp4$/.test(v.url) ? v.url.replace(/\.mp4$/, ".jpg") : null; return src ? <img src={mediaUrl(src)} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />; })()}</span>
                  <span className="w-full truncate text-xs capitalize">{h.name}</span>
                </button>))}
            </div>)}
          <div className="card overflow-hidden"><Tabs tabs={tabs} value={tab} onChange={setTab} />
            <div className="p-2 sm:p-3">
              {tab === "portfolio" && (posts.loading ? <GridSkeleton /> : shown.length ? <SquareGrid posts={shown} /> : <EmptyState title={u.is_me ? "Share your first piece" : "No work posted yet"} text={u.is_me ? "Use the Post button to add your portfolio." : undefined} />)}
              {tab === "videos" && (work.filter((x) => x.media[0]?.type === "video").length ? <SquareGrid posts={work.filter((x) => x.media[0]?.type === "video")} /> : <EmptyState title="No videos yet" icon="video" />)}
              {tab === "audio" && (work.filter((x) => x.media[0]?.type === "audio").length ? <div className="space-y-3">{work.filter((x) => x.media[0]?.type === "audio").map((x) => <div key={x.id} className="overflow-hidden rounded-xl"><AudioPlayer src={x.media[0].url} label={x.caption} /><p className="muted px-1 py-2 text-sm">{x.caption}</p></div>)}</div> : <EmptyState title="No audio yet" icon="audio" />)}
              {tab === "reviews" && (reviews.loading ? <ListSkeleton rows={2} /> : reviews.data?.length ? <ul className="divide-y divide-slate-200 dark:divide-slate-800">{reviews.data.map((r) => (
                <li key={r.id} className="flex gap-3 p-3"><Avatar user={r.reviewer} size={40} /><div><div className="flex items-center gap-2 text-sm"><span className="font-semibold">{r.reviewer.company || r.reviewer.name}</span><Stars value={r.rating} /><span className="muted text-xs">{timeAgo(r.created_at)}</span></div>{r.comment && <p className="mt-1 text-sm">{r.comment}</p>}</div></li>))}</ul> : <EmptyState title="No reviews yet" text="Reviews appear after a brand completes a job." icon="star" />)}
              {tab === "briefs" && (posts.loading ? <ListSkeleton /> : posts.data?.items.length ? <div className="space-y-3">{posts.data.items.map((x) => <PostCard key={x.id} post={x} />)}</div> : <EmptyState title="Nothing posted yet" />)}
              {tab === "about" && (
                <div className="space-y-4 p-3 text-sm">
                  {p ? (<>
                    {p.specialties.length > 0 && <div><h3 className="mb-1 font-semibold">Specialties</h3><ul className="list-disc pl-5">{p.specialties.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                    <div><h3 className="mb-1 font-semibold">Tools</h3><div className="flex flex-wrap gap-1.5">{p.tools.length ? p.tools.map((t) => <span key={t} className="chip-accent">{t}</span>) : <span className="muted">Not specified</span>}</div></div>
                    <div><h3 className="mb-1 font-semibold">Industries</h3><div className="flex flex-wrap gap-1.5">{p.categories.map((t) => <span key={t} className="chip capitalize">{t}</span>)}</div></div>
                    <div><h3 className="mb-1 font-semibold">Mediums</h3><div className="flex flex-wrap gap-1.5">{p.mediums.map((t) => <span key={t} className="chip capitalize">{t}</span>)}</div></div>
                    {p.ideal_client && <div><h3 className="mb-1 font-semibold">Ideal client</h3><p>{p.ideal_client}</p></div>}
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="muted text-xs">Price range</div><div className="font-semibold">{p.price_min || p.price_max ? `${inr(p.price_min)} – ${inr(p.price_max)}` : "On request"}</div></div><div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="muted text-xs">Turnaround</div><div className="font-semibold">{p.turnaround_days} days</div></div></div>
                  </>) : <p>{u.company ? `${u.company} is hiring AI creators on CreatorMatch.` : "Brand on CreatorMatch."}</p>}
                </div>)}
            </div>
          </div>
        </>)}
    </AppShell>
  );
}
