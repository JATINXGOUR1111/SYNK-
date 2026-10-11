"use client";
import { useRouter } from "next/navigation";
import type { NotificationItem as N } from "@/lib/types";
import { api } from "@/lib/api";
import { Avatar, Icon } from "./ui";
import { timeAgo, cn } from "@/lib/utils";

const ICON: Record<string, string> = { like: "heart", comment_like: "heart", comment: "comment", reply: "comment", follow: "user", mention: "comment", new_post: "image",
  proposal_received: "briefcase", proposal_accepted: "check", proposal_rejected: "x", milestone: "clock", brief_match: "sparkle", message: "mail", review: "star", shortlist: "bookmark" };

export function notificationHref(n: N): string {
  if (n.conversation_id && (n.type === "message" || n.type === "proposal_accepted")) return n.proposal_id && n.type === "proposal_accepted" ? `/proposals/${n.proposal_id}` : `/messages/${n.conversation_id}`;
  if (n.proposal_id) return `/proposals/${n.proposal_id}`;
  if (n.brief_id) return `/briefs/${n.brief_id}`;
  if (n.post_id) return `/p/${n.post_id}`;
  if (n.type === "follow" && n.actor) return `/${n.actor.handle}`;
  return "/notifications";
}

export default function NotificationItem({ n, onRead }: { n: N; onRead: (id: number) => void }) {
  const router = useRouter();
  async function open() {
    if (!n.read) { onRead(n.id); api.post(`/notifications/${n.id}/read`).catch(() => undefined); }
    router.push(notificationHref(n));
  }
  return (
    <button onClick={open} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800", !n.read && "bg-violet-50/70 dark:bg-violet-500/5")}>
      <span className="relative">{n.actor ? <Avatar user={n.actor} size={44} /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name="sparkle" /></span>}
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-violet-600 shadow dark:bg-slate-800"><Icon name={ICON[n.type] ?? "bell"} className="h-3 w-3" /></span></span>
      <span className="min-w-0 flex-1"><span className="block text-sm">{n.text}</span><span className="muted text-xs">{timeAgo(n.created_at)}</span></span>
      {!n.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" aria-label="Unread" />}
    </button>
  );
}
