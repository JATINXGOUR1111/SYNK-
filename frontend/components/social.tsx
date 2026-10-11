"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Icon } from "./ui";
import { cn } from "@/lib/utils";

export function useRequireLogin() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  return (action = "do that"): boolean => {
    if (user) return true;
    toast(`Sign up to ${action}`, "info");
    router.push("/register");
    return false;
  };
}

export function LikeButton({ postId, liked, count, onChange }: { postId: number; liked: boolean; count: number; onChange: (liked: boolean, count: number) => void }) {
  const need = useRequireLogin();
  const toast = useToast();
  const [pop, setPop] = useState(false);
  async function toggle() {
    if (!need("like posts")) return;
    const next = !liked;
    onChange(next, Math.max(0, count + (next ? 1 : -1))); // optimistic
    if (next) { setPop(true); setTimeout(() => setPop(false), 400); }
    try {
      const r = next ? await api.post<{ like_count: number }>(`/posts/${postId}/like`) : await api.del<{ like_count: number }>(`/posts/${postId}/like`);
      onChange(next, r.like_count);
    } catch (e) {
      onChange(liked, count);
      toast(e instanceof ApiError ? e.message : "Could not update like", "error");
    }
  }
  return (
    <button onClick={toggle} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"} className="group flex items-center gap-1.5 rounded-full p-1.5 transition hover:bg-rose-50 dark:hover:bg-rose-500/10">
      <Icon name="heart" filled={liked} className={cn("h-6 w-6 transition", liked ? "text-rose-500" : "text-slate-700 group-hover:text-rose-500 dark:text-slate-200", pop && "animate-pop")} />
      <span className="text-sm font-medium tabular-nums">{count}</span>
    </button>
  );
}

export function FollowButton({ userId, following, onChange, size = "sm" }: { userId: number; following: boolean; onChange?: (f: boolean) => void; size?: "sm" | "md" }) {
  const need = useRequireLogin();
  const toast = useToast();
  const { user } = useAuth();
  const [state, setState] = useState(following);
  const [busy, setBusy] = useState(false);
  if (user?.id === userId) return null;
  async function toggle() {
    if (!need("follow creators")) return;
    const next = !state;
    setState(next); setBusy(true);
    try {
      if (next) await api.post(`/users/${userId}/follow`); else await api.del(`/users/${userId}/follow`);
      onChange?.(next);
      if (next) toast("Followed");
    } catch (e) {
      setState(!next);
      toast(e instanceof ApiError ? e.message : "Could not update follow", "error");
    } finally { setBusy(false); }
  }
  return (
    <button disabled={busy} onClick={toggle} aria-pressed={state}
      className={cn(state ? "btn-outline" : "btn-primary", size === "sm" ? "btn-sm" : "")}>{state ? "Following" : "Follow"}</button>
  );
}
