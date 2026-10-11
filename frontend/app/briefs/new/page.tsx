"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { useAuth, useToast } from "@/components/Providers";
import { api, ApiError } from "@/lib/api";
import { Icon, Spinner } from "@/components/ui";
import type { Brief, Question, Structured } from "@/lib/types";
import { TOOL_OPTIONS, cn } from "@/lib/utils";

const numOrNull = (v: string): number | null => (v.trim() === "" || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
const listOf = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

export default function NewBrief() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<"idea" | "questions" | "edit">("idea");
  const [idea, setIdea] = useState("");
  const [qs, setQs] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [s, setS] = useState<Structured | null>(null);
  const [busy, setBusy] = useState(false);

  async function clarify() {
    if (idea.trim().length < 3) return;
    setBusy(true);
    try {
      const r = await api.post<{ questions: Question[] }>("/briefs/clarify", { rough_idea: idea });
      setQs(r.questions);
      if (r.questions.length === 0) await structure({}); else setStep("questions");
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not analyse your idea", "error"); } finally { setBusy(false); }
  }
  async function structure(a: Record<string, string>) {
    setBusy(true);
    try { setS(await api.post<Structured>("/briefs/structure", { rough_idea: idea, answers: a })); setStep("edit"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not build the brief", "error"); } finally { setBusy(false); }
  }
  async function publish() {
    if (!s) return;
    setBusy(true);
    try { const b = await api.post<Brief>("/briefs", { rough_idea: idea, structured: s }); toast("Brief published to the feed"); router.push(`/briefs/${b.id}`); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not publish", "error"); setBusy(false); }
  }
  const up = <K extends keyof Structured>(k: K, v: Structured[K]) => setS((x) => (x ? { ...x, [k]: v } : x));

  if (user && user.role !== "brand") return <AppShell requireAuth title="New brief"><div className="card p-6 text-center text-sm">Only brand accounts can post briefs.</div></AppShell>;
  const stepNo = step === "idea" ? 1 : step === "questions" ? 2 : 3;
  return (
    <AppShell requireAuth title="New brief" wide>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div><h1 className="text-xl font-bold">New brief</h1>
          <ol className="mt-3 flex gap-2 text-xs font-semibold" aria-label="Progress">{["Your idea", "Questions", "Review"].map((l, i) => <li key={l} aria-current={stepNo === i + 1 ? "step" : undefined} className={cn("flex-1 rounded-full px-3 py-1.5 text-center", stepNo >= i + 1 ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white" : "bg-slate-200 dark:bg-slate-800")}>{l}</li>)}</ol></div>

        {step === "idea" && (
          <div className="card space-y-3 p-5">
            <label htmlFor="idea" className="label">Describe what you need in one line</label>
            <textarea id="idea" className="input min-h-[110px]" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={2000} placeholder="e.g. cheerful 15-second skincare reel, around 30k, in 7 days" />
            <div className="flex flex-wrap gap-1.5">{["Cheerful 15-second skincare reel, around 30k, in 7 days", "Upbeat 20-second jingle for a fintech app, budget 25k", "5 luxury jewellery product images, gold tones, under 35k"].map((x) => <button key={x} type="button" className="chip hover:bg-violet-100 dark:hover:bg-violet-500/20" onClick={() => setIdea(x)}>{x}</button>)}</div>
            <button className="btn-primary w-full" onClick={clarify} disabled={busy || idea.trim().length < 3}>{busy ? <><Spinner /> Thinking…</> : <><Icon name="sparkle" className="h-4 w-4" />Continue</>}</button>
          </div>)}

        {step === "questions" && (
          <div className="card space-y-5 p-5"><p className="text-sm font-medium">A few quick questions so creators get a clear brief. Skip any you want.</p>
            {qs.map((q, i) => { const key = q.q; return (
              <div key={i}><label className="label" htmlFor={`q${i}`}>{q.q}</label>
                <input id={`q${i}`} className="input" value={answers[key] ?? ""} onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">{q.examples.map((ex) => <button key={ex} type="button" className="chip hover:bg-violet-100 dark:hover:bg-violet-500/20" onClick={() => setAnswers({ ...answers, [key]: ex })}>{ex}</button>)}</div></div>); })}
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => setStep("idea")}>Back</button><button className="btn-primary flex-1" disabled={busy} onClick={() => structure(Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())))}>{busy ? <><Spinner /> Building brief…</> : "Build my brief"}</button></div>
          </div>)}

        {step === "edit" && s && (
          <div className="card space-y-4 p-5"><p className="muted text-sm">Check and edit anything. Unknown fields stay empty and are never guessed.</p>
            <div><label className="label" htmlFor="t">Title</label><input id="t" className="input" value={s.title} onChange={(e) => up("title", e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="g">Goal</label><input id="g" className="input" value={s.goal ?? ""} onChange={(e) => up("goal", e.target.value || null)} /></div>
              <div><label className="label" htmlFor="a">Target audience</label><input id="a" className="input" value={s.target_audience ?? ""} onChange={(e) => up("target_audience", e.target.value || null)} /></div>
              <div><label className="label" htmlFor="f">Format</label><select id="f" className="input" value={s.format ?? ""} onChange={(e) => up("format", (e.target.value || null) as Structured["format"])}><option value="">Not sure</option>{["video", "image", "audio", "mixed"].map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="label" htmlFor="p">Platform</label><input id="p" className="input" value={s.platform ?? ""} onChange={(e) => up("platform", e.target.value || null)} /></div>
              <div><label className="label" htmlFor="d">Duration or size</label><input id="d" className="input" value={s.duration_or_size ?? ""} onChange={(e) => up("duration_or_size", e.target.value || null)} /></div>
              <div><label className="label" htmlFor="bmin">Budget min (₹)</label><input id="bmin" inputMode="numeric" className="input" value={s.budget_range_inr.min ?? ""} onChange={(e) => up("budget_range_inr", { ...s.budget_range_inr, min: numOrNull(e.target.value) })} /></div>
              <div><label className="label" htmlFor="bmax">Budget max (₹)</label><input id="bmax" inputMode="numeric" className="input" value={s.budget_range_inr.max ?? ""} onChange={(e) => up("budget_range_inr", { ...s.budget_range_inr, max: numOrNull(e.target.value) })} /></div>
              <div><label className="label" htmlFor="dl">Deadline (days)</label><input id="dl" inputMode="numeric" className="input" value={s.deadline_days ?? ""} onChange={(e) => up("deadline_days", numOrNull(e.target.value))} /></div>
              <div><label className="label" htmlFor="tone">Tone and style (comma separated)</label><input id="tone" className="input" defaultValue={s.tone_and_style.join(", ")} onBlur={(e) => up("tone_and_style", listOf(e.target.value))} /></div>
            </div>
            <div><span className="label">Deliverables</span>
              {s.deliverables.map((d, i) => <div key={i} className="mb-2 flex gap-2"><input aria-label={`Deliverable ${i + 1} type`} className="input" value={d.type} onChange={(e) => up("deliverables", s.deliverables.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} /><input aria-label={`Deliverable ${i + 1} quantity`} type="number" min={1} className="input !w-24" value={d.quantity} onChange={(e) => up("deliverables", s.deliverables.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))} /><button className="icon-btn" aria-label="Remove deliverable" onClick={() => up("deliverables", s.deliverables.filter((_, j) => j !== i))}><Icon name="x" className="h-4 w-4" /></button></div>)}
              <button type="button" className="btn-outline btn-sm" onClick={() => up("deliverables", [...s.deliverables, { type: "", quantity: 1 }])}>Add deliverable</button></div>
            <div><span className="label">Preferred tools</span><div className="flex flex-wrap gap-1.5">{TOOL_OPTIONS.map((t) => <button type="button" key={t} aria-pressed={s.preferred_tools.includes(t)} onClick={() => up("preferred_tools", s.preferred_tools.includes(t) ? s.preferred_tools.filter((x) => x !== t) : [...s.preferred_tools, t])} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", s.preferred_tools.includes(t) ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-slate-700")}>{t}</button>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="mh">Must have (comma separated)</label><input id="mh" className="input" defaultValue={s.must_have.join(", ")} onBlur={(e) => up("must_have", listOf(e.target.value))} placeholder="e.g. Must use Runway" /></div><div><label className="label" htmlFor="av">Avoid (comma separated)</label><input id="av" className="input" defaultValue={s.avoid.join(", ")} onBlur={(e) => up("avoid", listOf(e.target.value))} /></div></div>
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => setStep("idea")}>Start over</button><button className="btn-primary flex-1" onClick={publish} disabled={busy || !s.title.trim()}>{busy ? <Spinner /> : "Publish brief"}</button></div>
          </div>)}
      </div>
    </AppShell>
  );
}
