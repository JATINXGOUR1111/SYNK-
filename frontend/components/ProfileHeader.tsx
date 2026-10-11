"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Me, UserFull } from "@/lib/types";
import { api, ApiError, mediaUrl } from "@/lib/api";
import { Avatar, Icon, RoleBadge, Stars, VerifiedTick } from "./ui";
import { FollowButton, useRequireLogin } from "./social";
import InviteButton from "./InviteButton";
import ImageUploadButton from "./ImageUploadButton";
import { useAuth, useToast } from "./Providers";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-900/[0.035] px-2 py-2.5 text-center dark:bg-white/[0.05]">
      <div className="text-lg font-bold leading-tight tabular-nums">{value}</div>
      <div className="muted mt-0.5 text-[11px] font-medium">{label}</div>
    </div>
  );
}

export default function ProfileHeader({ u, onFollowChange, onUpdated }: { u: UserFull; onFollowChange: (f: boolean) => void; onUpdated: (patch: Partial<UserFull>) => void }) {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const need = useRequireLogin();
  const [saved, setSaved] = useState(false);

  async function message() {
    if (!need("send messages")) return;
    try { const c = await api.post<{ id: number }>("/conversations", { user_id: u.id }); router.push(`/messages/${c.id}`); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not open chat", "error"); }
  }
  async function toggleSave() {
    if (!need("save creators")) return;
    try { if (saved) await api.del(`/users/${u.id}/save`); else await api.post(`/users/${u.id}/save`); setSaved(!saved); toast(saved ? "Removed from saved" : "Creator saved", saved ? "info" : "success"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }
  async function setImage(field: "avatar_url" | "banner_url", url: string) {
    const me = await api.put<Me>("/auth/me", { [field]: url });
    setUser(me);
    onUpdated({ [field]: url } as Partial<UserFull>);
    toast(field === "avatar_url" ? "Profile photo updated" : "Cover photo updated");
  }
  const p = u.profile;
  return (
    <header className="card overflow-hidden !p-0">
      <div className="relative h-44 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 sm:h-60">
        {u.banner_url && <img src={mediaUrl(u.banner_url)} alt="" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" aria-hidden="true" />
        {u.is_me && (
          <ImageUploadButton kind="banner" ariaLabel="Change cover photo" onUploaded={(url) => setImage("banner_url", url)}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/65">
            <Icon name="image" className="h-4 w-4" />{u.banner_url ? "Change cover" : "Add cover photo"}
          </ImageUploadButton>)}
      </div>
      <div className="px-4 pb-5 sm:px-7">
        <div className="-mt-14 flex items-end justify-between gap-3">
          <div className="relative">
            <span className="story-ring inline-flex rounded-full p-[3px]"><span className="rounded-full bg-white p-1 dark:bg-ink-950"><Avatar user={u} size={104} /></span></span>
            {u.is_me && (
              <ImageUploadButton kind="avatar" ariaLabel="Change profile photo" onUploaded={(url) => setImage("avatar_url", url)}
                className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-glow ring-2 ring-white transition hover:scale-105 dark:ring-ink-950">
                <Icon name="image" className="h-4 w-4" />
              </ImageUploadButton>)}
          </div>
          {u.is_me && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Link href="/settings" className="btn-outline btn-sm">Edit profile</Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Are you sure you want to log out?")) {
                    logout();
                    router.push("/login");
                  }
                }}
                className="btn-outline btn-sm !border-rose-300 !text-rose-600 hover:!bg-rose-50 dark:!border-rose-900/60 dark:!text-rose-400 dark:hover:!bg-rose-950/30 inline-flex items-center gap-1.5"
                aria-label="Log out"
              >
                <Icon name="logout" className="h-3.5 w-3.5" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{u.name}</h1>{u.verified && <VerifiedTick />}<RoleBadge role={u.role} /></div>
          <div className="muted text-sm">@{u.handle}{u.company ? ` · ${u.company}` : ""}{p?.location ? ` · ${p.location}` : ""}</div>
          {p?.headline && <p className="mt-2 text-[15px] font-semibold">{p.headline}</p>}
          {p?.bio && <p className="muted mt-1.5 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed !text-slate-700 dark:!text-slate-300">{p.bio}</p>}
          {p?.links?.length ? <div className="mt-2 flex flex-wrap gap-3 text-sm">{p.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className="link">{l.replace(/^https?:\/\//, "")}</a>)}</div> : null}
        </div>
        {!u.is_me && (
          <div className="mt-4 flex flex-wrap gap-2">
            <FollowButton userId={u.id} following={u.is_following} onChange={onFollowChange} size="md" />
            <button className="btn-outline" onClick={message}>Message</button>
            {u.role === "creator" && user?.role === "brand" && (<><InviteButton creator={u} className="btn-outline" /><button className="btn-primary" onClick={message}>Hire</button></>)}
            {u.role === "creator" && <button className="icon-btn border border-slate-300/80 dark:border-white/15" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Remove creator from saved" : "Save creator"}><Icon name="bookmark" filled={saved} /></button>}
          </div>)}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Stat label="Posts" value={u.stats.posts} /><Stat label="Followers" value={u.stats.followers} /><Stat label="Following" value={u.stats.following} />
          {u.role === "creator" ? (<>
            <Stat label={`Rating${u.stats.rating_count ? ` (${u.stats.rating_count})` : ""}`} value={u.stats.rating_count ? <span className="inline-flex flex-col items-center"><span>{u.stats.rating.toFixed(1)}</span><Stars value={u.stats.rating} size={10} /></span> : "New"} />
            <Stat label="Avg turnaround" value={u.stats.avg_turnaround ? `${u.stats.avg_turnaround}d` : "—"} /></>) : <><Stat label="Role" value="Brand" /><Stat label="Joined" value={new Date(u.created_at).getFullYear()} /></>}
        </div>
      </div>
    </header>
  );
}
