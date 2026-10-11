"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Comment } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Avatar, Icon, Spinner } from "./ui";
import Caption from "./Caption";
import { useRequireLogin } from "./social";
import { timeAgo, cn } from "@/lib/utils";

function Row({ c, postId, onReply, onChanged, canDelete }: { c: Comment; postId: number; onReply: (c: Comment) => void; onChanged: () => void; canDelete: boolean }) {
  const need = useRequireLogin();
  const toast = useToast();
  const [liked, setLiked] = useState(c.liked);
  const [n, setN] = useState(c.like_count);
  async function like() {
    if (!need("like comments")) return;
    const next = !liked; setLiked(next); setN(n + (next ? 1 : -1));
    try { const r = next ? await api.post<{ like_count: number }>(`/comments/${c.id}/like`) : await api.del<{ like_count: number }>(`/comments/${c.id}/like`); setN(r.like_count); }
    catch (e) { setLiked(!next); setN(n); toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }
  async function del() {
    try { await api.del(`/comments/${c.id}`); onChanged(); toast("Comment deleted", "info"); } catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }
  return (
    <div className="flex gap-2.5">
      <Link href={`/${c.author.handle}`}><Avatar user={c.author} size={28} /></Link>
      <div className="min-w-0 flex-1">
        <div className="text-sm"><Link href={`/${c.author.handle}`} className="mr-1.5 font-semibold">{c.author.handle}</Link><Caption text={c.body} inline /></div>
        <div className="muted mt-0.5 flex items-center gap-3 text-xs">
          <span>{timeAgo(c.created_at)}</span>
          {n > 0 && <span>{n} like{n > 1 ? "s" : ""}</span>}
          <button className="font-semibold hover:underline" onClick={() => onReply(c)}>Reply</button>
          {canDelete && <button className="font-semibold hover:underline" onClick={del} aria-label="Delete comment">Delete</button>}
        </div>
      </div>
      <button onClick={like} aria-pressed={liked} aria-label={liked ? "Unlike comment" : "Like comment"} className="self-start p-1"><Icon name="heart" filled={liked} className={cn("h-4 w-4", liked ? "text-rose-500" : "text-slate-400")} /></button>
    </div>
  );
}

export default function CommentThread({ postId, count, postAuthorId, onCount, expandedDefault }: { postId: number; count: number; postAuthorId: number; onCount: (n: number) => void; expandedDefault?: boolean }) {
  const { user } = useAuth();
  const need = useRequireLogin();
  const toast = useToast();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [all, setAll] = useState(!!expandedDefault);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get<Comment[]>(`/posts/${postId}/comments`); setItems(r); onCount(r.reduce((a, c) => a + 1 + (c.replies?.length ?? 0), 0)); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not load comments"); }
  }, [postId, onCount]);
  useEffect(() => { if (count > 0 || all) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [postId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!need("comment") || !text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/posts/${postId}/comments`, { body: text.trim(), parent_id: reply?.id ?? null });
      setText(""); setReply(null); setAll(true); await load();
    } catch (e2) { toast(e2 instanceof ApiError ? e2.message : "Could not post comment", "error"); }
    finally { setBusy(false); }
  }
  const shown = items ? (all ? items : items.slice(0, 2)) : [];
  return (
    <div className="space-y-3">
      {err && <button className="text-xs text-rose-500 underline" onClick={load}>{err}. Retry</button>}
      {items === null && count > 0 && !err && <div className="muted flex items-center gap-2 text-xs"><Spinner /> Loading comments</div>}
      {items && items.length > 2 && !all && <button className="muted text-sm hover:underline" onClick={() => setAll(true)}>View all {items.reduce((a, c) => a + 1 + (c.replies?.length ?? 0), 0)} comments</button>}
      {shown.map((c) => (
        <div key={c.id} className="space-y-2.5">
          <Row c={c} postId={postId} onReply={setReply} onChanged={load} canDelete={user?.id === c.author.id || user?.id === postAuthorId} />
          {all && c.replies?.map((r) => <div key={r.id} className="ml-9"><Row c={r} postId={postId} onReply={() => setReply(c)} onChanged={load} canDelete={user?.id === r.author.id || user?.id === postAuthorId} /></div>)}
          {!all && !!c.replies?.length && <button className="muted ml-9 text-xs hover:underline" onClick={() => setAll(true)}>View {c.replies.length} repl{c.replies.length > 1 ? "ies" : "y"}</button>}
        </div>))}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="input !rounded-full !py-2" aria-label="Add a comment"
          placeholder={reply ? `Replying to @${reply.author.handle}` : "Add a comment…"} />
        {reply && <button type="button" className="icon-btn" aria-label="Cancel reply" onClick={() => setReply(null)}><Icon name="x" className="h-4 w-4" /></button>}
        <button className="btn-primary btn-sm" disabled={busy || !text.trim()}>{busy ? <Spinner /> : "Post"}</button>
      </form>
    </div>
  );
}
