"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useAuth, useToast } from "@/components/Providers";
import { api, ApiError, mediaUrl } from "@/lib/api";
import ImageUploadButton from "@/components/ImageUploadButton";
import { Avatar, Icon, Spinner } from "@/components/ui";
import type { Me, Profile } from "@/lib/types";
import { CATEGORY_OPTIONS, MEDIUMS, TOOL_OPTIONS, cn } from "@/lib/utils";

function Multi({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (<div><span className="label">{label}</span><div className="flex flex-wrap gap-1.5">{options.map((o) => (
    <button type="button" key={o} aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium capitalize", value.includes(o) ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-slate-700")}>{o}</button>))}</div></div>);
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [acct, setAcct] = useState({ name: "", handle: "", avatar_url: "", company: "" });
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (user) { setAcct({ name: user.name, handle: user.handle, avatar_url: user.avatar_url ?? "", company: user.company ?? "" }); if (user.role === "creator") api.get<Profile>("/creators/me/profile").then(setP).catch(() => undefined); } }, [user]);

  async function saveAcct(e: FormEvent) {
    e.preventDefault(); setBusy("acct");
    try { setUser(await api.put<Me>("/auth/me", { name: acct.name, handle: acct.handle.replace(/^@/, ""), avatar_url: acct.avatar_url || null, company: acct.company || null })); toast("Account saved"); }
    catch (e2) { toast(e2 instanceof ApiError ? e2.message : "Could not save", "error"); } finally { setBusy(null); }
  }
  async function savePhoto(patch: Record<string, unknown>, msg: string) {
    try { setUser(await api.put<Me>("/auth/me", patch)); toast(msg); } catch (e) { toast(e instanceof ApiError ? e.message : "Could not save photo", "error"); }
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); if (!p) return; setBusy("profile");
    try { setP(await api.put<Profile>("/creators/me/profile", { headline: p.headline, bio: p.bio, ideal_client: p.ideal_client, location: p.location, tools: p.tools, categories: p.categories, mediums: p.mediums, specialties: p.specialties, price_min: p.price_min, price_max: p.price_max, turnaround_days: p.turnaround_days, links: p.links })); toast("Profile saved"); }
    catch (e2) { toast(e2 instanceof ApiError ? e2.message : "Could not save", "error"); } finally { setBusy(null); }
  }
  async function generate() {
    setBusy("gen");
    try { setP(await api.post<Profile>("/creators/me/generate-profile")); toast("Profile written by AI. Review and edit it."); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not generate", "error"); } finally { setBusy(null); }
  }
  const up = (k: keyof Profile, v: unknown) => setP((x) => (x ? { ...x, [k]: v } : x));
  return (
    <AppShell requireAuth title="Settings" wide>
      <h1 className="text-xl font-bold">Settings</h1>
      {user && (
        <section className="card overflow-hidden !p-0" aria-label="Photos">
          <div className="relative h-40 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 sm:h-48">
            {user.banner_url && <img src={mediaUrl(user.banner_url)} alt="Cover photo" className="h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" aria-hidden="true" />
            <div className="absolute right-3 top-3 flex gap-2">
              <ImageUploadButton kind="banner" ariaLabel="Upload cover photo" onUploaded={(url) => savePhoto({ banner_url: url }, "Cover photo updated")}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-black/65"><Icon name="upload" className="h-4 w-4" />{user.banner_url ? "Change cover" : "Add cover photo"}</ImageUploadButton>
              {user.banner_url && <button type="button" className="rounded-full bg-black/45 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-black/65" onClick={() => savePhoto({ clear_banner: true }, "Cover photo removed")}>Remove</button>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="-mt-14 rounded-full bg-white p-1 shadow-soft dark:bg-ink-950"><Avatar user={user} size={92} /></span>
            <div className="min-w-0 flex-1"><div className="font-semibold">Profile photo</div><p className="muted text-xs">Square works best. JPG, PNG or WEBP. We resize it for you.</p></div>
            <div className="flex gap-2">
              <ImageUploadButton kind="avatar" ariaLabel="Upload profile photo" onUploaded={(url) => savePhoto({ avatar_url: url }, "Profile photo updated")} className="btn-primary btn-sm"><Icon name="upload" className="h-4 w-4" />{user.avatar_url ? "Change photo" : "Upload photo"}</ImageUploadButton>
              {user.avatar_url && <button type="button" className="btn-outline btn-sm" onClick={() => savePhoto({ clear_avatar: true }, "Profile photo removed")}>Remove</button>}
            </div>
          </div>
        </section>)}
      <form onSubmit={saveAcct} className="card space-y-3 p-5"><h2 className="font-semibold">Account</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="n">Name</label><input id="n" className="input" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} required /></div>
          <div><label className="label" htmlFor="h">Handle</label><input id="h" className="input" value={acct.handle} onChange={(e) => setAcct({ ...acct, handle: e.target.value })} required pattern="@?[A-Za-z0-9_]{3,30}" /></div>
          {user?.role === "brand" && <div><label className="label" htmlFor="c">Company</label><input id="c" className="input" value={acct.company} onChange={(e) => setAcct({ ...acct, company: e.target.value })} /></div>}
          <div className="sm:col-span-2"><label className="label" htmlFor="a">Avatar URL (http or https)</label><input id="a" className="input" value={acct.avatar_url} onChange={(e) => setAcct({ ...acct, avatar_url: e.target.value })} placeholder="https://…" /></div>
        </div>
        <button className="btn-primary" disabled={busy === "acct"}>{busy === "acct" ? <Spinner /> : "Save account"}</button></form>
      {user?.role === "creator" && p && (
        <form onSubmit={saveProfile} className="card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Creator profile</h2><button type="button" className="btn-outline btn-sm" onClick={generate} disabled={busy === "gen"}>{busy === "gen" ? <Spinner /> : <Icon name="sparkle" className="h-4 w-4 text-violet-500" />}Write with AI</button></div>
          <div><label className="label" htmlFor="hl">Headline</label><input id="hl" className="input" maxLength={200} value={p.headline} onChange={(e) => up("headline", e.target.value)} /></div>
          <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" className="input min-h-[88px]" value={p.bio} onChange={(e) => up("bio", e.target.value)} /></div>
          <div><label className="label" htmlFor="ic">Ideal client</label><textarea id="ic" className="input" value={p.ideal_client} onChange={(e) => up("ideal_client", e.target.value)} /></div>
          <div><label className="label" htmlFor="sp">Specialties (one per line)</label><textarea id="sp" className="input" value={p.specialties.join("\n")} onChange={(e) => up("specialties", e.target.value.split("\n").filter(Boolean))} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="loc">Location</label><input id="loc" className="input" value={p.location} onChange={(e) => up("location", e.target.value)} /></div>
            <div><label className="label" htmlFor="tat">Turnaround (days)</label><input id="tat" type="number" min={1} max={365} className="input" value={p.turnaround_days} onChange={(e) => up("turnaround_days", Number(e.target.value))} /></div>
            <div><label className="label" htmlFor="pmin">Price from (₹)</label><input id="pmin" type="number" min={0} className="input" value={p.price_min} onChange={(e) => up("price_min", Number(e.target.value))} /></div>
            <div><label className="label" htmlFor="pmax">Price to (₹)</label><input id="pmax" type="number" min={0} className="input" value={p.price_max} onChange={(e) => up("price_max", Number(e.target.value))} /></div></div>
          <Multi label="Tools" options={TOOL_OPTIONS} value={p.tools} onChange={(v) => up("tools", v)} />
          <Multi label="Industries" options={CATEGORY_OPTIONS} value={p.categories} onChange={(v) => up("categories", v)} />
          <Multi label="Mediums" options={MEDIUMS} value={p.mediums} onChange={(v) => up("mediums", v)} />
          <div><label className="label" htmlFor="lk">Links (one per line, http or https)</label><textarea id="lk" className="input" value={p.links.join("\n")} onChange={(e) => up("links", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></div>
          <button className="btn-primary" disabled={busy === "profile"}>{busy === "profile" ? <Spinner /> : "Save profile"}</button>
        </form>)}

      <section className="card flex items-center justify-between p-5" aria-label="Session">
        <div>
          <h2 className="font-semibold text-rose-600 dark:text-rose-400">Account session</h2>
          <p className="muted text-xs">Sign out of your account on this device.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm("Are you sure you want to log out?")) {
              logout();
              router.push("/login");
            }
          }}
          className="btn-outline !border-rose-300 !text-rose-600 hover:!bg-rose-50 dark:!border-rose-900/60 dark:!text-rose-400 dark:hover:!bg-rose-950/30 flex items-center gap-1.5"
        >
          <Icon name="logout" className="h-4 w-4" />
          <span>Log out</span>
        </button>
      </section>
    </AppShell>
  );
}
