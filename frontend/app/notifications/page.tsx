"use client";
import { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import NotificationItem from "@/components/NotificationItem";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth, useToast } from "@/components/Providers";
import type { NotificationItem as N } from "@/lib/types";

export default function Notifications() {
  const { refreshCounts, user } = useAuth();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useFetch(() => api.get<N[]>("/notifications"), [user?.id]);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => api.get<N[]>("/notifications").then(setData).catch(() => undefined), 5000); return () => clearInterval(t); }, [setData]);
  async function readAll() { await api.post("/notifications/read-all"); setData((d) => d?.map((n) => ({ ...n, read: true })) ?? d); refreshCounts(); toast("All caught up", "info"); tick((x) => x + 1); }
  const groups: [string, N["group"]][] = [["Today", "today"], ["This week", "this_week"], ["Earlier", "earlier"]];
  return (
    <AppShell requireAuth title="Notifications">
      <div className="flex items-center justify-between"><h1 className="text-xl font-bold">Notifications</h1>{data?.some((n) => !n.read) && <button className="btn-outline btn-sm" onClick={readAll}>Mark all as read</button>}</div>
      {loading ? <ListSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <EmptyState title="No notifications yet" text="Likes, comments, follows and proposals will show up here." icon="bell" /> : (
        <div className="space-y-4">{groups.map(([label, g]) => { const items = data.filter((n) => n.group === g); return items.length ? (
          <section key={g} aria-label={label}><h2 className="muted mb-1.5 px-1 text-xs font-semibold">{label}</h2><div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">{items.map((n) => <NotificationItem key={n.id} n={n} onRead={(id) => { setData((d) => d?.map((x) => (x.id === id ? { ...x, read: true } : x)) ?? d); refreshCounts(); }} />)}</div></section>) : null; })}</div>)}
    </AppShell>
  );
}
