"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, mediaUrl } from "@/lib/api";
import type { Conversation, Message } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Avatar, Icon, Spinner, Skeleton, ErrorState } from "./ui";
import { clock, cn, inr } from "@/lib/utils";

export default function ChatThread({ id }: { id: number }) {
  const { user, refreshCounts } = useAuth();
  const toast = useToast();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [attach, setAttach] = useState<string | null>(null);
  const lastId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const poll = useCallback(async (first = false) => {
    try {
      const r = await api.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}/messages`, { after: first ? 0 : lastId.current });
      setConv(r.conversation); setErr(null);
      if (r.messages.length) {
        lastId.current = r.messages[r.messages.length - 1].id;
        setMsgs((m) => (first ? r.messages : [...m, ...r.messages.filter((n) => !m.some((x) => x.id === n.id))]));
        if (r.messages.some((m) => m.sender_id !== user?.id)) api.post(`/conversations/${id}/read`).then(refreshCounts).catch(() => undefined);
      } else if (first) api.post(`/conversations/${id}/read`).catch(() => undefined);
    } catch (e) { if (first) setErr(e instanceof ApiError ? e.message : "Could not load chat"); } finally { if (first) setLoading(false); }
  }, [id, user?.id, refreshCounts]);
  useEffect(() => { lastId.current = 0; setMsgs([]); setLoading(true); poll(true); const t = setInterval(() => poll(false), 5000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !attach) return;
    setBusy(true);
    try { await api.post(`/conversations/${id}/messages`, { body: text.trim(), attachment_url: attach }); setText(""); setAttach(null); await poll(false); }
    catch (e2) { toast(e2 instanceof ApiError ? e2.message : "Could not send", "error"); } finally { setBusy(false); }
  }
  async function upload(f: File) {
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api.form<{ url: string; type: string }>("/uploads", fd); if (r.type !== "image") { toast("Only image attachments are supported", "error"); return; } setAttach(r.url); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Upload failed", "error"); }
  }
  if (loading) return <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-64" /></div>;
  if (err || !conv) return <ErrorState message={err ?? "Conversation not found"} onRetry={() => poll(true)} />;
  const other = conv.others[0];
  const pr = conv.proposal;
  return (
    <div className="card flex h-[calc(100vh-190px)] min-h-[420px] flex-col overflow-hidden md:h-[calc(100vh-110px)]">
      <header className="flex items-center gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
        <Link href="/messages" className="icon-btn md:hidden" aria-label="Back to messages"><Icon name="back" /></Link>
        {other && <Link href={`/${other.handle}`} className="flex items-center gap-3"><Avatar user={other} size={36} /><div className="text-sm font-semibold">{other.name}<div className="muted text-xs font-normal">@{other.handle}</div></div></Link>}
      </header>
      {pr && (
        <Link href={`/proposals/${pr.proposal_id}`} className="flex items-center justify-between gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2.5 text-sm dark:border-violet-500/20 dark:bg-violet-500/10">
          <span className="min-w-0"><span className="block truncate font-semibold">{pr.brief_title}</span><span className="muted text-xs">{inr(pr.price_inr)} · {pr.milestones_approved}/{pr.milestones_total} milestones approved</span></span>
          <span className="chip-accent capitalize">{pr.status}</span>
        </Link>)}
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {msgs.length === 0 && <p className="muted py-10 text-center text-sm">Say hello to start the conversation.</p>}
        {msgs.map((m) => { const mine = m.sender_id === user?.id; return (
          <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 text-white" : "rounded-bl-md bg-slate-100 dark:bg-slate-800")}>
              {m.attachment_url && <img src={mediaUrl(m.attachment_url)} alt="Attachment" className="mb-1 max-h-60 rounded-lg" />}
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              <div className={cn("mt-0.5 text-right text-[10px]", mine ? "text-white/70" : "muted")}>{clock(m.created_at)}{mine && m.read_at ? " · Seen" : ""}</div>
            </div>
          </div>); })}
        <div ref={bottom} />
      </div>
      {attach && <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2 dark:border-slate-800"><img src={mediaUrl(attach)} alt="Attachment preview" className="h-12 w-12 rounded-lg object-cover" /><button className="icon-btn" aria-label="Remove attachment" onClick={() => setAttach(null)}><Icon name="x" className="h-4 w-4" /></button></div>}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <button type="button" className="icon-btn" aria-label="Attach image" onClick={() => file.current?.click()}><Icon name="image" /></button>
        <input className="input !rounded-full" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" aria-label="Message" maxLength={3000} />
        <button className="btn-primary !rounded-full !px-3.5" disabled={busy || (!text.trim() && !attach)} aria-label="Send message">{busy ? <Spinner /> : <Icon name="send" className="h-4 w-4" />}</button>
      </form>
    </div>
  );
}
