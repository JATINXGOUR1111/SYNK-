"use client";
import Link from "next/link";
import type { Post } from "@/lib/types";
import { useAuth } from "./Providers";
import { Avatar, Icon, RoleBadge, VerifiedTick } from "./ui";
import { budgetLabel, timeAgo } from "@/lib/utils";

export default function BriefCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const b = post.brief;
  const budget = budgetLabel(b?.budget_range_inr);
  return (
    <article className="card overflow-hidden border-l-4 !border-l-violet-500" aria-label={`Brief by ${post.author.name}`}>
      <div className="space-y-3 p-4">
        <header className="flex items-center gap-3">
          <Link href={`/${post.author.handle}`}><Avatar user={post.author} size={40} /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/${post.author.handle}`} className="truncate text-sm font-semibold hover:underline">{post.author.company || post.author.name}</Link>
              {post.author.verified && <VerifiedTick />}<RoleBadge role="brand" /><span className="muted text-xs">· {timeAgo(post.created_at)}</span>
            </div>
            <div className="chip-accent mt-1"><Icon name="briefcase" className="h-3 w-3" />New brief</div>
          </div>
          {post.fit != null && <div className="text-right"><div className="gradient-text text-xl font-bold leading-none">{post.fit}%</div><div className="muted text-[10px]">your fit</div></div>}
        </header>
        <div>
          <h3 className="text-base font-semibold leading-snug">{b?.title ?? "Brief"}</h3>
          {(b?.goal || post.caption) && <p className="muted mt-1 text-sm">{b?.goal || post.caption}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {budget && <span className="chip"><Icon name="star" className="h-3 w-3" />{budget}</span>}
          {b?.deadline_days != null && <span className="chip"><Icon name="clock" className="h-3 w-3" />{b.deadline_days} days</span>}
          {b?.format && <span className="chip capitalize">{b.format}</span>}
          {b?.status && b.status !== "open" && <span className="chip capitalize">{b.status.replace("_", " ")}</span>}
        </div>
        {post.brief_id && (user?.role === "creator" ? (
          <Link href={`/briefs/${post.brief_id}`} className="btn-primary w-full">Send proposal</Link>
        ) : user?.id === post.author.id ? (
          <Link href={`/briefs/${post.brief_id}`} className="btn-outline w-full">Manage brief</Link>
        ) : !user ? <Link href="/register" className="btn-primary w-full">Sign up to send a proposal</Link> : <Link href={`/briefs/${post.brief_id}`} className="btn-outline w-full">View brief</Link>)}
      </div>
    </article>
  );
}
