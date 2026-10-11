"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth, useToast } from "./Providers";
import { API_URL, ApiError } from "@/lib/api";
import { Icon, Spinner } from "./ui";
import ThemeToggle from "./ThemeToggle";
import { cn } from "@/lib/utils";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [role, setRole] = useState<"creator" | "brand">(sp.get("role") === "brand" ? "brand" : "creator");
  const [f, setF] = useState({ email: "", password: "", name: "", handle: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (user) router.replace(next); }, [user, next, router]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (mode === "login") await login(f.email, f.password);
      else await register({ email: f.email, password: f.password, name: f.name, handle: f.handle.replace(/^@/, ""), role, company: role === "brand" ? f.company || undefined : undefined });
      toast(mode === "login" ? "Welcome back" : "Welcome to CreatorMatch");
      router.replace(next);
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Something went wrong"); } finally { setBusy(false); }
  }
  async function demo(email: string) { setBusy(true); try { await login(email, "demo1234"); router.replace(next); } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Demo login failed"); } finally { setBusy(false); } }
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="mesh relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-hidden="true">
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2.5"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><Icon name="sparkle" className="h-5 w-5" /></span><span className="text-xl font-bold">CreatorMatch</span></Link>
        <div className="relative">
          <div className="relative mb-10 h-72">
            {[["work_0_0.jpg", "left-0 top-6 w-44", "-7deg", "0s"], ["work_6_0.jpg", "left-36 top-0 w-48", "4deg", "1s"], ["work_8_0.jpg", "left-72 top-12 w-40", "-2deg", "2s"]].map(([f, pos, rot, d]) => (
              <img key={f} src={`${API_URL}/static/demo/${f}`} alt="" style={{ "--r": rot, animationDelay: d } as React.CSSProperties} className={`absolute ${pos} aspect-[4/5] animate-float rounded-2xl border border-white/30 object-cover shadow-2xl`} />))}
          </div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">Where AI creators get discovered and hired.</h2>
          <p className="mt-3 max-w-sm text-white/70">One feed. One-line briefs. Matches you can explain.</p>
        </div>
      </aside>
      <div className="relative flex items-center justify-center px-4 py-10">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-7 flex items-center justify-center gap-2.5 lg:hidden"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow"><Icon name="sparkle" className="h-5 w-5" /></span><span className="text-2xl font-bold">Creator<span className="gradient-text">Match</span></span></Link>
          <form onSubmit={submit} className="card space-y-4 p-7" aria-label={mode === "login" ? "Log in" : "Sign up"}>
            <div><h1 className="text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1><p className="muted mt-1 text-sm">{mode === "login" ? "Log in to your feed, briefs and messages." : "Join as a creator or a brand."}</p></div>
            {mode === "register" && (
              <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2">
                {(["creator", "brand"] as const).map((r) => <button type="button" key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cn("rounded-2xl border px-3 py-2.5 text-sm font-semibold transition", role === r ? "border-violet-500 bg-violet-500/10 text-violet-700 shadow-[0_0_0_3px_rgba(139,92,246,.15)] dark:text-violet-200" : "border-slate-200 hover:border-violet-300 dark:border-white/10")}>{r === "creator" ? "I am a creator" : "I am a brand"}</button>)}
              </div>)}
            {mode === "register" && <div><label className="label" htmlFor="name">{role === "brand" ? "Your name" : "Full name"}</label><input id="name" className="input" required value={f.name} onChange={set("name")} autoComplete="name" /></div>}
            {mode === "register" && role === "brand" && <div><label className="label" htmlFor="company">Company or agency</label><input id="company" className="input" value={f.company} onChange={set("company")} autoComplete="organization" /></div>}
            {mode === "register" && <div><label className="label" htmlFor="handle">Handle</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">@</span><input id="handle" className="input !pl-8" required pattern="[A-Za-z0-9_]{3,30}" title="3-30 letters, numbers or underscores" value={f.handle} onChange={set("handle")} autoCapitalize="none" /></div></div>}
            <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required value={f.email} onChange={set("email")} autoComplete="email" /></div>
            <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" required minLength={mode === "register" ? 8 : 1} maxLength={72} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} />{mode === "register" && <p className="muted mt-1 text-xs">At least 8 characters.</p>}</div>
            {err && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{err}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <Spinner /> : mode === "login" ? "Log in" : "Sign up"}</button>
            <p className="muted text-center text-sm">{mode === "login" ? <>New here? <Link className="link font-semibold" href="/register">Sign up</Link></> : <>Have an account? <Link className="link font-semibold" href="/login">Log in</Link></>}</p>
          </form>
          {mode === "login" && (
            <div className="card mt-4 p-4 text-sm"><p className="muted mb-2.5 text-center">Explore with a demo account · password demo1234</p>
              <div className="flex gap-2"><button className="btn-outline btn-sm flex-1" disabled={busy} onClick={() => demo("brand@demo.com")}>Demo brand</button><button className="btn-outline btn-sm flex-1" disabled={busy} onClick={() => demo("creator1@demo.com")}>Demo creator</button></div></div>)}
        </div>
      </div>
    </div>
  );
}
