"use client";
import Link from "next/link";
import { useState } from "react";
import type { Match } from "@/lib/types";
import { api, ApiError, mediaUrl } from "@/lib/api";
import { useToast } from "./Providers";
import { Avatar, Icon, Spinner, Stars, VerifiedTick } from "./ui";
import InviteButton from "./InviteButton";
import { inrShort } from "@/lib/utils";

function Ring({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r, pct = Math.round(value * 100);
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Overall match ${pct} percent`}>
      <svg viewBox="0 0 64 64" className="-rotate-90"><defs><linearGradient id="ring" x1="0" x2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#d946ef" /></linearGradient></defs>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke="url(#ring)" strokeDasharray={c} strokeDashoffset={c * (1 - value)} /></svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}%</span>
    </div>
  );
}
function Bar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div title={hint}><div className="mb-0.5 flex justify-between text-xs"><span className="font-medium">{label}</span><span className="muted tabular-nums">{Math.round(value * 100)}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.round(value * 100)}%` }} /></div></div>
  );
}

export default function MatchCard({ m, briefId, rank }: { m: Match; briefId: number; rank: number }) {
  const toast = useToast();
  const [short, setShort] = useState(m.shortlisted);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try { if (short) await api.del(`/briefs/${briefId}/shortlist/${m.creator.id}`); else await api.post(`/briefs/${briefId}/shortlist/${m.creator.id}`); setShort(!short); toast(short ? "Removed from shortlist" : "Shortlisted. The creator was notified.", short ? "info" : "success"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  return (
    <article className="card space-y-4 p-4" aria-label={`Match ${rank}: ${m.creator.name}`}>
      <header className="flex items-center gap-3">
        <span className="muted w-5 text-center text-sm font-bold">#{rank}</span>
        <Link href={`/${m.creator.handle}`}><Avatar user={m.creator} size={52} /></Link>
        <div className="min-w-0 flex-1">
          <Link href={`/${m.creator.handle}`} className="flex items-center gap-1 truncate font-semibold hover:underline">{m.creator.name}{m.creator.verified && <VerifiedTick />}</Link>
          <div className="muted truncate text-xs">{m.creator.headline}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span>{inrShort(m.price_min)} – {inrShort(m.price_max)}</span><span>{m.turnaround_days}d turnaround</span>{m.rating_count > 0 ? <span className="inline-flex items-center gap-1"><Stars value={m.rating} size={11} />{m.rating.toFixed(1)} ({m.rating_count})</span> : <span className="muted">No reviews yet</span>}</div>
        </div>
        <Ring value={m.score.total} />
      </header>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Bar label="Style and industry" value={m.score.semantic} hint="Semantic similarity blended with industry overlap" />
        <Bar label="Tools" value={m.score.tools} /><Bar label="Budget fit" value={m.score.budget} /><Bar label="Quality and speed" value={m.score.quality} hint="Rating, turnaround and verification" />
      </div>
      <div className="rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-200"><Icon name="sparkle" className="h-3.5 w-3.5" />Why this match</div>
        <p>{m.why_match}</p>{m.strengths.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5">{m.strengths.map((s) => <li key={s}>{s}</li>)}</ul>}</div>
      <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"><Icon name="alert" className="mt-0.5 h-4 w-4" /><div><span className="font-semibold">Watch out: </span>{m.watch_out}</div></div>
      {m.pieces.length > 0 && <div className="hide-scroll flex gap-2 overflow-x-auto" aria-label="Relevant work">{m.pieces.map((p) => (
        <Link key={p.post_id} href={`/p/${p.post_id}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800" aria-label={p.caption.slice(0, 50)}>
          {p.media?.type === "image" ? <img src={mediaUrl(p.media.url)} alt={p.caption.slice(0, 60)} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name={p.media?.type === "audio" ? "audio" : "video"} /></span>}</Link>))}</div>}
      <footer className="flex flex-wrap gap-2">
        <button className={short ? "btn-outline btn-sm" : "btn-primary btn-sm"} onClick={toggle} disabled={busy} aria-pressed={short}>{busy ? <Spinner /> : <Icon name="bookmark" filled={short} className="h-4 w-4" />}{short ? "Shortlisted" : "Shortlist"}</button>
        <Link href={`/${m.creator.handle}`} className="btn-outline btn-sm">View profile</Link>
        <InviteButton creator={m.creator} />
      </footer>
    </article>
  );
}
