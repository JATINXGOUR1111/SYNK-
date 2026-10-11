"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Post } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Avatar, Icon, RoleBadge, VerifiedTick } from "./ui";
import { MediaCarousel } from "./media";
import Caption from "./Caption";
import CommentThread from "./CommentThread";
import { LikeButton, useRequireLogin } from "./social";
import InviteButton from "./InviteButton";
import BriefCard from "./BriefCard";
import { timeAgo, cn } from "@/lib/utils";

export default function PostCard({ post: initial, onDeleted, expanded }: { post: Post; onDeleted?: (id: number) => void; expanded?: boolean }) {
  const [p, setP] = useState(initial);
  const { user } = useAuth();
  const toast = useToast();
  const need = useRequireLogin();
  const [showComments, setShowComments] = useState(!!expanded || initial.comment_count > 0);
  const setCount = useCallback((n: number) => setP((x) => (x.comment_count === n ? x : { ...x, comment_count: n })), []);

  if (p.kind === "brief") return <BriefCard post={p} />;

  const like = (liked: boolean, count: number) => setP((x) => ({ ...x, liked, like_count: count }));
  async function save() {
    if (!need("save posts")) return;
    const next = !p.saved;
    setP((x) => ({ ...x, saved: next, save_count: x.save_count + (next ? 1 : -1) }));
    try { if (next) await api.post(`/posts/${p.id}/save`); else await api.del(`/posts/${p.id}/save`); toast(next ? "Saved" : "Removed from saved", next ? "success" : "info"); }
    catch (e) { setP((x) => ({ ...x, saved: !next })); toast(e instanceof ApiError ? e.message : "Could not save", "error"); }
  }
  async function share() {
    const url = `${window.location.origin}/p/${p.id}`;
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url, "info"); }
  }
  async function del() {
    if (!confirm("Delete this post?")) return;
    try { await api.del(`/posts/${p.id}`); toast("Post deleted", "info"); onDeleted?.(p.id); } catch (e) { toast(e instanceof ApiError ? e.message : "Could not delete", "error"); }
  }
  const mine = user?.id === p.author.id;
  const styles = [...(p.tags.style_tags ?? []), ...(p.tags.industry_fit ?? [])].slice(0, 5);
  return (
    <article className="card overflow-hidden" aria-label={`Post by ${p.author.name}`}>
      <header className="flex items-center gap-3 p-3 sm:p-4">
        <Link href={`/${p.author.handle}`}><Avatar user={p.author} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/${p.author.handle}`} className="truncate text-sm font-semibold hover:underline">{p.author.name}</Link>
            {p.author.verified && <VerifiedTick />}<RoleBadge role={p.author.role} />
            <span className="muted text-xs">· {timeAgo(p.created_at)}</span>
          </div>
          <div className="muted truncate text-xs">{p.author.headline || `@${p.author.handle}`}</div>
        </div>
        {user?.role === "brand" && p.author.role === "creator" && <InviteButton creator={p.author} />}
        {mine && <button className="icon-btn" onClick={del} aria-label="Delete post"><Icon name="trash" className="h-4 w-4" /></button>}
      </header>
      <div className="px-2.5 sm:px-3"><div className="overflow-hidden rounded-[1.1rem]"><MediaCarousel media={p.media} alt={p.caption.slice(0, 80) || `Work by ${p.author.name}`} onDoubleLike={() => { if (!p.liked && need("like posts")) { like(true, p.like_count + 1); api.post<{ like_count: number }>(`/posts/${p.id}/like`).then((r) => like(true, r.like_count)).catch(() => like(false, p.like_count)); } }} /></div></div>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="-ml-1.5 flex items-center gap-1">
          <LikeButton postId={p.id} liked={p.liked} count={p.like_count} onChange={like} />
          <button className="flex items-center gap-1.5 rounded-full p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Comments" aria-expanded={showComments} onClick={() => setShowComments((s) => !s)}>
            <Icon name="comment" className="h-6 w-6" /><span className="text-sm font-medium tabular-nums">{p.comment_count}</span>
          </button>
          <button className="rounded-full p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Share link" onClick={share}><Icon name="share" className="h-6 w-6" /></button>
          <button className="ml-auto rounded-full p-1.5 transition hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-800" aria-pressed={p.saved} aria-label={p.saved ? "Remove from saved" : "Save post"} onClick={save}>
            <Icon name="bookmark" filled={p.saved} className={cn("h-6 w-6", p.saved && "text-violet-600 dark:text-violet-400")} />
          </button>
        </div>
        {p.caption && <div><Link href={`/${p.author.handle}`} className="mr-1.5 text-sm font-semibold">{p.author.handle}</Link><Caption text={p.caption} inline /></div>}
        {(p.declared_tools.length > 0 || styles.length > 0 || p.trust_risk === "high" || p.trust_risk === "medium") && (
          <div className="flex flex-wrap gap-1.5">
            {p.declared_tools.map((t) => <Link key={t} href={`/explore?tool=${encodeURIComponent(t)}`} className="chip-accent">{t}</Link>)}
            {styles.map((t) => <span key={t} className="chip" title="Detected by AI">{t}</span>)}
            {(p.trust_risk === "high" || p.trust_risk === "medium") && <span className="chip !bg-amber-100 !text-amber-800 dark:!bg-amber-500/20 dark:!text-amber-200" title="Automatic screening aid, not a legal judgment">Trust check: review</span>}
          </div>)}
        {showComments && <CommentThread postId={p.id} count={p.comment_count} postAuthorId={p.author.id} onCount={setCount} expandedDefault={expanded} />}
      </div>
    </article>
  );
}
