"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Brief, UserBrief } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Modal, Spinner } from "./ui";

export default function InviteButton({ creator, label = "Invite to brief", className = "btn-outline btn-sm" }: { creator: UserBrief; label?: string; className?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  if (!user || user.role !== "brand" || creator.role !== "creator") return null;
  async function show() {
    setOpen(true);
    try { setBriefs((await api.get<Brief[]>("/briefs", { status: "open" })).filter((b) => b.status === "open")); } catch (e) { toast(e instanceof ApiError ? e.message : "Could not load briefs", "error"); setBriefs([]); }
  }
  async function invite(id: number) {
    setBusy(id);
    try { await api.post(`/briefs/${id}/shortlist/${creator.id}`); toast(`${creator.name} invited`); setOpen(false); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not invite", "error"); } finally { setBusy(null); }
  }
  return (
    <>
      <button className={className} onClick={show}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Invite ${creator.name} to a brief`}>
        {briefs === null ? <div className="flex justify-center py-6"><Spinner /></div> : briefs.length === 0 ? (
          <div className="py-4 text-center text-sm"><p className="muted mb-3">You have no open briefs yet.</p><Link href="/briefs/new" className="btn-primary" onClick={() => setOpen(false)}>Create a brief</Link></div>
        ) : <ul className="space-y-2">{briefs.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <span className="min-w-0 truncate text-sm font-medium">{b.title}</span>
            <button className="btn-primary btn-sm" disabled={busy === b.id} onClick={() => invite(b.id)}>{busy === b.id ? <Spinner /> : "Invite"}</button>
          </li>))}</ul>}
      </Modal>
    </>
  );
}
