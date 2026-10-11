"use client";
import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import { useFetch } from "@/lib/hooks";
import { Avatar, EmptyState, ErrorState, Icon, ListSkeleton } from "./ui";
import { timeAgo, cn } from "@/lib/utils";

export default function ConversationList({ activeId }: { activeId?: number }) {
  const { data, setData, loading, error, reload } = useFetch(() => api.get<Conversation[]>("/conversations"), []);
  useEffect(() => { const t = setInterval(() => api.get<Conversation[]>("/conversations").then(setData).catch(() => undefined), 5000); return () => clearInterval(t); }, [setData]);
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState title="No conversations yet" text="Message a creator from their profile, or accept a proposal to open a project chat." icon="mail" />;
  return (
    <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800" aria-label="Conversations">
      {data.map((c) => { const o = c.others[0]; return (
        <li key={c.id}><Link href={`/messages/${c.id}`} className={cn("flex items-center gap-3 px-4 py-3 transition hover:bg-slate-100 dark:hover:bg-slate-800", activeId === c.id && "bg-violet-50 dark:bg-violet-500/10")}>
          {o && <Avatar user={o} size={46} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 truncate text-sm font-semibold">{c.kind === "proposal" && <Icon name="briefcase" className="h-3.5 w-3.5 text-violet-500" />}{o?.name ?? "Conversation"}</span><span className="muted shrink-0 text-xs">{timeAgo(c.updated_at)}</span></div>
            {c.proposal && <div className="truncate text-xs font-medium text-violet-600 dark:text-violet-300">{c.proposal.brief_title} · {c.proposal.status}</div>}
            <div className={cn("truncate text-sm", c.unread ? "font-semibold" : "muted")}>{c.last_message ? (c.last_message.body || "Sent an image") : "No messages yet"}</div>
          </div>
          {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
        </Link></li>); })}
    </ul>
  );
}
