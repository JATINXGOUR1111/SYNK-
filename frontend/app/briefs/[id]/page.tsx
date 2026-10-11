"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import MatchCard from "@/components/MatchCard";
import { useAuth, useToast } from "@/components/Providers";
import { Avatar, EmptyState, ErrorState, Icon, ListSkeleton, Skeleton, Spinner, Stars } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { Brief, BriefProposal, Concept, Match, PriceSuggestion } from "@/lib/types";
import { budgetLabel, inr, timeAgo } from "@/lib/utils";

function Facts({ b }: { b: Brief }) {
  const s = b.structured;
  const rows: [string, string | null][] = [["Goal", s.goal], ["Audience", s.target_audience], ["Format", s.format], ["Platform", s.platform], ["Duration or size", s.duration_or_size],
    ["Budget", budgetLabel(s.budget_range_inr)], ["Deadline", s.deadline_days != null ? `${s.deadline_days} days` : null], ["Tone", s.tone_and_style.join(", ") || null],
    ["Deliverables", s.deliverables.map((d) => `${d.quantity} × ${d.type}`).join(", ") || null], ["Preferred tools", s.preferred_tools.join(", ") || null], ["Must have", s.must_have.join(", ") || null], ["Avoid", s.avoid.join(", ") || null]];
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3"><Link href={`/${b.brand.handle}`}><Avatar user={b.brand} size={44} /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-lg font-bold leading-snug">{b.title}</h1><p className="muted text-xs">{b.brand.company || b.brand.name} · {timeAgo(b.created_at)} ago</p></div>
        <span className="chip-accent capitalize">{b.status.replace("_", " ")}</span></div>
      <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="muted text-xs">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
    </section>
  );
}

function BrandTools({ b }: { b: Brief }) {
  const toast = useToast();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [mBusy, setMBusy] = useState(false);
  const [price, setPrice] = useState<PriceSuggestion | null>(null);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const props = useFetch(() => api.get<BriefProposal[]>(`/briefs/${b.id}/proposals`), [b.id]);

  async function match() {
    setMBusy(true);
    try { setMatches((await api.post<{ matches: Match[] }>(`/briefs/${b.id}/match`)).matches); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Matching failed", "error"); } finally { setMBusy(false); }
  }
  async function run<T>(key: string, path: string, set: (v: T) => void) {
    setBusy(key);
    try { set(await api.post<T>(path)); } catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); } finally { setBusy(null); }
  }
  async function decide(id: number, status: "accepted" | "rejected") {
    try { await api.post(`/proposals/${id}/status`, { status }); toast(status === "accepted" ? "Proposal accepted. Workspace opened." : "Proposal declined", status === "accepted" ? "success" : "info"); props.reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }
  return (
    <>
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Best-fit creators</h2>
          <button className="btn-primary" onClick={match} disabled={mBusy}>{mBusy ? <><Spinner /> Matching…</> : <><Icon name="sparkle" className="h-4 w-4" />{matches ? "Refresh matches" : "Find my top 5"}</>}</button></div>
        {matches === null && !mBusy && <p className="muted text-sm">AI ranks creators on style, tools, budget and quality, then explains each match and flags one honest risk.</p>}
        {mBusy && <div className="space-y-3"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>}
        {matches && matches.length === 0 && <EmptyState title="No creators passed your filters" text="Try raising the budget, relaxing the deadline, or removing a mandatory tool." />}
        {matches && matches.length > 0 && <div className="space-y-4">{matches.map((m, i) => <MatchCard key={m.creator.id} m={m} briefId={b.id} rank={i + 1} />)}</div>}
      </section>

      <section className="card space-y-3 p-5"><h2 className="font-semibold">Pricing and concepts</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" disabled={busy === "price"} onClick={() => run<PriceSuggestion>("price", `/briefs/${b.id}/pricing`, setPrice)}>{busy === "price" ? <Spinner /> : null}Suggest a fair price</button>
          <button className="btn-outline btn-sm" disabled={busy === "concepts"} onClick={() => run<{ concepts: Concept[] }>("concepts", `/briefs/${b.id}/concepts`, (r) => setConcepts(r.concepts))}>{busy === "concepts" ? <Spinner /> : null}Mood board concepts</button></div>
        {price && (price.mid === null ? <p className="muted text-sm">{price.reasoning}</p> : (
          <div className="rounded-xl bg-slate-100 p-4 dark:bg-slate-800"><div className="grid grid-cols-3 text-center">{([["Low", price.low], ["Typical", price.mid], ["High", price.high]] as const).map(([l, v]) => <div key={l}><div className="muted text-xs">{l}</div><div className="text-lg font-bold">{inr(v)}</div></div>)}</div><p className="muted mt-2 text-xs">{price.reasoning}</p></div>))}
        {concepts && <div className="grid gap-3 sm:grid-cols-2">{concepts.map((c) => (
          <div key={c.name} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="mb-2 flex h-10 overflow-hidden rounded-lg" aria-hidden="true">{c.palette.map((hex) => <span key={hex} className="flex-1" style={{ background: /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : "#94a3b8" }} />)}</div><div className="text-sm font-semibold">{c.name}</div><p className="muted mt-1 text-xs">{c.image_prompt}</p></div>))}</div>}
      </section>

      <section className="card space-y-3 p-5"><h2 className="font-semibold">Proposals</h2>
        {props.loading ? <ListSkeleton rows={2} /> : props.error ? <ErrorState message={props.error} onRetry={props.reload} /> : !props.data?.length ? <p className="muted text-sm">No proposals yet. Shortlisted creators are notified and can reply with one.</p> : (
          <ul className="space-y-3">{props.data.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center gap-3"><Avatar user={p.creator} size={40} /><div className="min-w-0 flex-1"><Link href={`/${p.creator.handle}`} className="text-sm font-semibold hover:underline">{p.creator.name}</Link><div className="muted flex items-center gap-1 text-xs">{p.rating_count ? <><Stars value={p.rating} size={11} />{p.rating.toFixed(1)}</> : "New creator"}</div></div><div className="text-right text-sm"><div className="font-bold">{inr(p.price_inr)}</div><div className="muted text-xs">{p.timeline_days} days</div></div></div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">{p.status === "pending" && b.status === "open" ? (<><button className="btn-primary btn-sm" onClick={() => decide(p.id, "accepted")}>Accept</button><button className="btn-outline btn-sm" onClick={() => decide(p.id, "rejected")}>Decline</button></>) : <span className="chip-accent capitalize">{p.status}</span>}
                {(p.status === "accepted" || p.status === "completed") && <Link href={`/proposals/${p.id}`} className="btn-outline btn-sm">Open workspace</Link>}</div>
            </li>))}</ul>)}
      </section>
    </>
  );
}

function CreatorTools({ b, reload }: { b: Brief; reload: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  if (b.my_proposal_id) return <section className="card flex flex-wrap items-center justify-between gap-3 p-5"><span className="text-sm font-medium">You have already sent a proposal for this brief.</span><Link className="btn-outline btn-sm" href={`/proposals/${b.my_proposal_id}`}>View proposal</Link></section>;
  if (b.status !== "open") return <EmptyState title="This brief is no longer open" icon="briefcase" />;
  async function draft() {
    setBusy("draft");
    try { const d = await api.post<{ proposal_text: string; suggested_price_inr: number; timeline_days: number }>("/proposals/draft", { brief_id: b.id }); setText(d.proposal_text); setPrice(String(d.suggested_price_inr)); setDays(String(d.timeline_days)); toast("Draft ready. Edit it before sending."); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not draft", "error"); } finally { setBusy(null); }
  }
  async function send() {
    setBusy("send");
    try { await api.post("/proposals", { brief_id: b.id, text, price_inr: Number(price), timeline_days: Number(days) }); toast("Proposal sent"); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not send", "error"); } finally { setBusy(null); }
  }
  const valid = text.trim().length >= 5 && Number(price) >= 0 && price !== "" && Number(days) >= 1;
  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Send a proposal</h2>
        <button className="btn-outline btn-sm" onClick={draft} disabled={busy !== null}>{busy === "draft" ? <Spinner /> : <Icon name="sparkle" className="h-4 w-4 text-violet-500" />}Draft with AI</button></div>
      <div><label className="label" htmlFor="pt">Your proposal</label><textarea id="pt" className="input min-h-[150px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} placeholder="Show you understood the goal, explain your approach, and set expectations." /></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="pp">Price (₹)</label><input id="pp" type="number" min={0} className="input" value={price} onChange={(e) => setPrice(e.target.value)} /></div><div><label className="label" htmlFor="pd">Timeline (days)</label><input id="pd" type="number" min={1} className="input" value={days} onChange={(e) => setDays(e.target.value)} /></div></div>
      <button className="btn-primary w-full" onClick={send} disabled={!valid || busy !== null}>{busy === "send" ? <Spinner /> : "Send proposal"}</button>
    </section>
  );
}

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: b, loading, error, reload } = useFetch(() => api.get<Brief>(`/briefs/${id}`), [id, user?.id]);
  return (
    <AppShell requireAuth title={b?.title ?? "Brief"} wide>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {loading ? <><Skeleton className="h-52" /><Skeleton className="h-40" /></> : error || !b ? <ErrorState message={error ?? "Brief not found"} onRetry={reload} /> : (
          <><Facts b={b} />{user?.role === "brand" && b.is_owner && <BrandTools b={b} />}{user?.role === "creator" && <CreatorTools b={b} reload={reload} />}</>)}
      </div>
    </AppShell>
  );
}
