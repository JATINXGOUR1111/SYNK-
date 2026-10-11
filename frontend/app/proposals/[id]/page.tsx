"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import ChatThread from "@/components/ChatThread";
import MilestoneTracker from "@/components/MilestoneTracker";
import { useAuth, useToast } from "@/components/Providers";
import { Avatar, ErrorState, Icon, Skeleton, Spinner, Stars } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { ProposalListItem } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

function ReviewBox({ id, onDone }: { id: number; onDone: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await api.post(`/proposals/${id}/review`, { rating, comment }); toast("Thanks for your review"); onDone(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not submit", "error"); } finally { setBusy(false); }
  }
  return (
    <section className="card space-y-3 p-5"><h2 className="font-semibold">Rate this creator</h2>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
        <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="rounded p-0.5 transition active:scale-90">
          <Icon name="star" filled={n <= rating} className={cn("h-8 w-8", n <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600")} /></button>))}</div>
      <textarea className="input" aria-label="Review" placeholder="How was it working together?" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? <Spinner /> : "Submit review"}</button></section>
  );
}

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const { data: p, loading, error, reload } = useFetch(() => api.get<ProposalListItem>(`/proposals/${id}`), [id, user?.id]);
  async function decide(status: "accepted" | "rejected") {
    try { await api.post(`/proposals/${id}/status`, { status }); toast(status === "accepted" ? "Proposal accepted" : "Proposal declined", status === "accepted" ? "success" : "info"); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }
  const other = p && user ? (user.role === "brand" ? p.creator : p.brand) : null;
  return (
    <AppShell requireAuth title="Workspace" wide>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {loading ? <><Skeleton className="h-32" /><Skeleton className="h-56" /></> : error || !p || !user ? <ErrorState message={error ?? "Proposal not found"} onRetry={reload} /> : (
          <>
            <header className="card space-y-3 p-5">
              <div className="flex items-start gap-3">{other && <Link href={`/${other.handle}`}><Avatar user={other} size={48} /></Link>}
                <div className="min-w-0 flex-1"><Link href={`/briefs/${p.brief_id}`} className="font-bold leading-snug hover:underline">{p.brief_title}</Link><p className="muted text-sm">with {other?.company || other?.name}</p></div>
                <span className="chip-accent capitalize">{p.status}</span></div>
              <div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="muted text-xs">Price</div><div className="font-bold">{inr(p.price_inr)}</div></div><div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="muted text-xs">Timeline</div><div className="font-bold">{p.timeline_days} days</div></div></div>
              <details className="text-sm"><summary className="cursor-pointer font-medium">Proposal</summary><p className="mt-2 whitespace-pre-wrap">{p.text}</p></details>
              <p className="muted text-xs">Payments are simulated in this demo. Milestones track progress only.</p>
            </header>
            {p.status === "pending" && (user.role === "brand" ? <div className="card flex gap-2 p-4"><button className="btn-primary flex-1" onClick={() => decide("accepted")}>Accept proposal</button><button className="btn-outline flex-1" onClick={() => decide("rejected")}>Decline</button></div> : <div className="card p-4 text-sm">Waiting for the brand to respond.</div>)}
            {p.status === "rejected" && <div className="card p-4 text-sm">This proposal was declined.</div>}
            {(p.status === "accepted" || p.status === "completed") && (<>
              <MilestoneTracker proposalId={p.id} milestones={p.milestones} role={user.role} active={p.status === "accepted"} onChange={reload} />
              {p.status === "completed" && (p.review ? <section className="card space-y-1 p-5"><h2 className="font-semibold">Review</h2><Stars value={p.review.rating} size={20} />{p.review.comment && <p className="text-sm">{p.review.comment}</p>}</section> : user.role === "brand" ? <ReviewBox id={p.id} onDone={reload} /> : <div className="card p-4 text-sm">All milestones approved. Waiting for the brand&apos;s review.</div>)}
              {p.conversation_id && <div><h2 className="mb-2 font-semibold">Project chat</h2><ChatThread id={p.conversation_id} /></div>}
            </>)}
          </>)}
      </div>
    </AppShell>
  );
}
