"use client";
import Link from "next/link";
import type { Post } from "@/lib/types";
import { mediaUrl } from "@/lib/api";
import { Icon } from "./ui";
import { cn } from "@/lib/utils";

function Tile({ p, square }: { p: Post; square?: boolean }) {
  const m = p.media[0];
  const ratio = square ? "aspect-square" : ["aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[5/4]"][p.id % 4];
  return (
    <Link href={`/p/${p.id}`} aria-label={`Open post: ${p.caption.slice(0, 60) || "view post"}`} className={cn("group relative block overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800", ratio, !square && "mb-2 break-inside-avoid")}>
      {!m ? <div className="flex h-full items-center justify-center p-3 text-center text-xs">{p.caption.slice(0, 90)}</div>
        : m.type === "image" ? <img src={mediaUrl(m.url)} alt={p.caption.slice(0, 80) || "Work"} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        : m.type === "video" ? <video src={mediaUrl(m.url) + "#t=0.5"} poster={/\/static\/demo\/clip_\d\.mp4$/.test(m.url) ? mediaUrl(m.url.replace(/\.mp4$/, ".jpg")) : undefined} muted preload="metadata" playsInline aria-label="Video" className="h-full w-full object-cover" />
        : <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name="audio" className="h-10 w-10" /></div>}
      {m && m.type !== "image" && <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><Icon name={m.type === "video" ? "video" : "audio"} className="h-3.5 w-3.5" /></span>}
      {p.media.length > 1 && <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white"><Icon name="grid" className="h-3.5 w-3.5" /></span>}
      <span className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="flex items-center gap-1"><Icon name="heart" filled className="h-4 w-4" />{p.like_count}</span>
        <span className="flex items-center gap-1"><Icon name="comment" filled className="h-4 w-4" />{p.comment_count}</span>
      </span>
    </Link>
  );
}

export function MasonryGrid({ posts }: { posts: Post[] }) {
  return <div className="columns-2 gap-2 sm:columns-3">{posts.map((p) => <Tile key={p.id} p={p} />)}</div>;
}
export function SquareGrid({ posts }: { posts: Post[] }) {
  return <div className="grid grid-cols-3 gap-1 sm:gap-2">{posts.map((p) => <Tile key={p.id} p={p} square />)}</div>;
}
