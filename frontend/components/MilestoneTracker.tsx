"use client";
import { useState } from "react";
import type { Milestone } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Providers";
import { Icon, Spinner } from "./ui";
import { inr, cn } from "@/lib/utils";

const ORDER: Milestone["status"][] = ["todo", "in_progress", "delivered", "approved"];
const LABEL: Record<Milestone["status"], string> = { todo: "To do", in_progress: "In progress", delivered: "Delivered", approved: "Approved" };

export default function MilestoneTracker({ proposalId, milestones, role, active, onChange }: { proposalId: number; milestones: Milestone[]; role: "creator" | "brand"; active: boolean; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  async function set(m: Milestone, status: Milestone["status"]) {
    setBusy(m.id);
    try { await api.patch(`/proposals/${proposalId}/milestones/${m.id}`, { status }); toast(status === "approved" ? "Milestone approved" : `Marked ${LABEL[status].toLowerCase()}`); onChange(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not update", "error"); } finally { setBusy(null); }
  }
  const done = milestones.filter((m) => m.status === "approved").length;
  return (
    <section className="card p-4" aria-label="Milestones">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Milestones</h2><span className="muted text-xs">{done}/{milestones.length} approved</span></div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${milestones.length ? (done / milestones.length) * 100 : 0}%` }} /></div>
      <ol className="space-y-3">{milestones.map((m, i) => {
        const idx = ORDER.indexOf(m.status);
        return (
          <li key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", m.status === "approved" ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-slate-700")}>{m.status === "approved" ? <Icon name="check" className="h-4 w-4" /> : i + 1}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{m.title}</div><div className="muted text-xs">{inr(m.amount_inr)} · due day {m.due_in_days}</div>
              <div className="mt-1.5 flex gap-1" aria-label={`Status: ${LABEL[m.status]}`}>{ORDER.map((s, k) => <span key={s} className={cn("h-1 flex-1 rounded-full", k <= idx ? "bg-violet-500" : "bg-slate-200 dark:bg-slate-700")} />)}</div></div>
            <div className="flex shrink-0 flex-col items-end gap-1"><span className="chip-accent">{LABEL[m.status]}</span>
              {active && busy === m.id ? <Spinner /> : active && role === "creator" && m.status === "todo" ? <button className="btn-outline btn-sm" onClick={() => set(m, "in_progress")}>Start</button>
                : active && role === "creator" && m.status === "in_progress" ? <button className="btn-primary btn-sm" onClick={() => set(m, "delivered")}>Mark delivered</button>
                : active && role === "brand" && m.status === "delivered" ? <button className="btn-primary btn-sm" onClick={() => set(m, "approved")}>Approve</button> : null}</div>
          </li>); })}</ol>
    </section>
  );
}
