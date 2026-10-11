"use client";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Brief } from "@/lib/types";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "./Providers";
import { Avatar, EmptyState, ErrorState, Icon, ListSkeleton } from "./ui";
import { budgetLabel, timeAgo } from "@/lib/utils";

export default function BriefList() {
  const { user } = useAuth();
  const isBrand = user?.role === "brand";
  const { data, loading, error, reload } = useFetch(() => api.get<Brief[]>("/briefs"), [user?.id]);
  return (
    <>
      <div className="flex items-center justify-between"><h1 className="text-xl font-bold">{isBrand ? "Your briefs" : "Opportunities"}</h1>{isBrand && <Link href="/briefs/new" className="btn-primary btn-sm"><Icon name="plus" className="h-4 w-4" />New brief</Link>}</div>
      {!isBrand && <p className="muted -mt-2 text-sm">Open briefs ranked by how well they fit your portfolio.</p>}
      {loading ? <ListSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState title={isBrand ? "No briefs yet" : "No open briefs right now"} text={isBrand ? "Type a one-line idea and AI will build the brief for you." : "New briefs from brands will appear here."} action={isBrand ? <Link href="/briefs/new" className="btn-primary">Create your first brief</Link> : undefined} icon="briefcase" />
      ) : <ul className="space-y-3">{data.map((b) => (
        <li key={b.id}><Link href={`/briefs/${b.id}`} className="card block space-y-2 p-4 transition hover:-translate-y-0.5">
          <div className="flex items-start gap-3">{!isBrand && <Avatar user={b.brand} size={40} />}
            <div className="min-w-0 flex-1"><h2 className="font-semibold leading-snug">{b.title}</h2><p className="muted text-xs">{!isBrand && `${b.brand.company || b.brand.name} · `}{timeAgo(b.created_at)} ago</p></div>
            {b.fit != null && <div className="text-right"><div className="gradient-text text-xl font-bold leading-none">{b.fit}%</div><div className="muted text-[10px]">your fit</div></div>}</div>
          <div className="flex flex-wrap gap-1.5">{budgetLabel(b.structured.budget_range_inr) && <span className="chip">{budgetLabel(b.structured.budget_range_inr)}</span>}{b.structured.deadline_days != null && <span className="chip">{b.structured.deadline_days} days</span>}{b.structured.format && <span className="chip capitalize">{b.structured.format}</span>}<span className="chip-accent capitalize">{b.status.replace("_", " ")}</span>{b.proposal_count > 0 && <span className="chip">{b.proposal_count} proposal{b.proposal_count > 1 ? "s" : ""}</span>}{b.my_proposal_id && <span className="chip !bg-emerald-100 !text-emerald-800">Proposal sent</span>}</div>
        </Link></li>))}</ul>}
    </>
  );
}
