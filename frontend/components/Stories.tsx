"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Post, Story, StoriesRes } from "@/lib/types";
import { api, mediaUrl } from "@/lib/api";
import { Avatar, Icon, Skeleton } from "./ui";
import { VideoPlayer, AudioPlayer } from "./media";
import { timeAgo, cn } from "@/lib/utils";
import { useAuth } from "./Providers";

export function StoryRing({ story, onClick, label, ring = true, avatarOverride }: { story?: Story; onClick: () => void; label: string; ring?: boolean; avatarOverride?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5" aria-label={`Open ${label}'s story`}>
      {avatarOverride ?? (story && <Avatar user={story.user} size={62} ring={ring} />)}
      <span className="w-full truncate text-center text-xs">{label}</span>
    </button>
  );
}

export function StoryViewer({ stories, start, onClose }: { stories: { user: Story["user"]; posts: Post[] }[]; start: number; onClose: () => void }) {
  const [si, setSi] = useState(start);
  const [pi, setPi] = useState(0);
  const [prog, setProg] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cur = stories[si];
  const post = cur?.posts[pi];
  const media = post?.media[0];

  const next = useCallback(() => {
    if (!cur) return;
    if (pi < cur.posts.length - 1) { setPi(pi + 1); setProg(0); }
    else if (si < stories.length - 1) { setSi(si + 1); setPi(0); setProg(0); }
    else onClose();
  }, [cur, pi, si, stories.length, onClose]);
  const prev = useCallback(() => {
    if (pi > 0) { setPi(pi - 1); setProg(0); } else if (si > 0) { setSi(si - 1); setPi(0); setProg(0); }
  }, [pi, si]);

  useEffect(() => {
    if (!post || media?.type === "video") return;
    const ms = media?.type === "audio" ? 8000 : 5000;
    setProg(0);
    timer.current = setInterval(() => setProg((p) => Math.min(1, p + 100 / ms)), 100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [post, media?.type]);
  useEffect(() => { if (prog >= 1) next(); }, [prog, next]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [next, prev, onClose]);

  if (!cur || !post) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`${cur.user.name}'s story`}>
      <div className="relative h-full w-full max-w-[460px] overflow-hidden bg-slate-900 sm:h-[92vh] sm:rounded-2xl">
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2">
          {cur.posts.map((_, i) => <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"><span className="block h-full bg-white" style={{ width: `${i < pi ? 100 : i === pi ? prog * 100 : 0}%` }} /></span>)}
        </div>
        <div className="absolute inset-x-0 top-4 z-20 flex items-center gap-2 p-3 text-white">
          <Avatar user={cur.user} size={32} />
          <Link href={`/${cur.user.handle}`} onClick={onClose} className="text-sm font-semibold">{cur.user.handle}</Link>
          <span className="text-xs text-white/70">{timeAgo(post.created_at)}</span>
          <button className="ml-auto rounded-full p-1.5 hover:bg-white/20" onClick={onClose} aria-label="Close story"><Icon name="x" /></button>
        </div>
        <div className="flex h-full items-center justify-center">
          {post.kind === "brief" && post.brief ? (
            <div className="p-8 text-center text-white"><div className="chip-accent mb-3">Open brief</div><h2 className="text-2xl font-bold">{post.brief.title}</h2><p className="mt-2 text-white/70">{post.caption}</p>{post.brief_id && <Link href={`/briefs/${post.brief_id}`} onClick={onClose} className="btn-primary mt-5">View brief</Link>}</div>
          ) : media?.type === "video" ? <VideoPlayer src={media.url} alt="Story video" className="h-full w-full" autoAdvance={next} fit="contain" />
            : media?.type === "audio" ? <div className="w-full px-4"><AudioPlayer src={media.url} label="Story audio" /></div>
            : media ? <img src={mediaUrl(media.url)} alt={post.caption.slice(0, 80) || "Story"} className="h-full w-full object-contain" />
            : <p className="px-8 text-center text-lg text-white">{post.caption}</p>}
        </div>
        {post.caption && media && <p className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 text-sm text-white">{post.caption.slice(0, 160)}</p>}
        <button className="absolute inset-y-0 left-0 z-10 w-1/3" aria-label="Previous" onClick={prev} />
        <button className="absolute inset-y-0 right-0 z-10 w-1/3" aria-label="Next" onClick={next} />
      </div>
    </div>
  );
}

export default function StoriesRow() {
  const { user } = useAuth();
  const [data, setData] = useState<StoriesRes | null>(null);
  const [open, setOpen] = useState<{ list: { user: Story["user"]; posts: Post[] }[]; start: number } | null>(null);
  useEffect(() => { api.get<StoriesRes>("/stories").then(setData).catch(() => setData({ stories: [], open_briefs: [] })); }, [user?.id]);
  if (!data) return <div className="card flex gap-4 overflow-hidden p-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex flex-col items-center gap-2"><Skeleton className="h-[62px] w-[62px] !rounded-full" /><Skeleton className="h-2.5 w-12" /></div>)}</div>;
  if (!data.stories.length && !data.open_briefs.length) return null;
  const list = data.stories.map((s) => ({ user: s.user, posts: s.posts }));
  return (
    <>
      <div className="card hide-scroll flex gap-3 overflow-x-auto p-3" aria-label="Stories">
        {user?.role === "brand" && data.open_briefs.length > 0 && (
          <StoryRing label="Open briefs" onClick={() => setOpen({ list: [{ user, posts: data.open_briefs }], start: 0 })}
            avatarOverride={<span className="story-ring inline-flex rounded-full p-[2.5px]"><span className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-white text-violet-600 dark:bg-ink-950"><Icon name="briefcase" className="h-6 w-6" /></span></span>} />)}
        {data.stories.map((s, i) => <StoryRing key={s.user.id} story={s} label={s.user.handle} onClick={() => setOpen({ list, start: i })} />)}
      </div>
      {open && <StoryViewer stories={open.list} start={open.start} onClose={() => setOpen(null)} />}
    </>
  );
}
