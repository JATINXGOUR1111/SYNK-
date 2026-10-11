"use client";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Feed from "@/components/Feed";
import { useAuth } from "@/components/Providers";
import { Icon, PostSkeleton } from "@/components/ui";
import { API_URL } from "@/lib/api";

const demo = (n: string) => `${API_URL}/static/demo/${n}`;

function Landing() {
  return (
    <section className="relative overflow-hidden rounded-[1.8rem] border border-white/10 mesh p-6 text-white shadow-[0_30px_80px_-30px_rgba(76,29,149,.7)] sm:p-9" aria-label="Welcome">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" aria-hidden="true" />
      <div className="relative z-10 max-w-md">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur"><Icon name="sparkle" className="h-3.5 w-3.5" />The marketplace for AI creators</span>
        <h1 className="mt-4 text-[2.1rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl">Hire AI creators who <span className="bg-gradient-to-r from-sky-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">show their work.</span></h1>
        <p className="mt-4 text-[15px] leading-relaxed text-white/75">Browse a living feed of AI-made ads, films, music and design. Post a one-line brief and get your five best-fit creators in minutes, with the reasons why.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/register?role=brand" className="btn bg-white text-violet-700 shadow-[0_12px_30px_-10px_rgba(255,255,255,.5)] hover:-translate-y-px">I am hiring</Link>
          <Link href="/register?role=creator" className="btn border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20">I am a creator</Link>
          <Link href="/login" className="btn text-white/80 hover:text-white">Log in</Link>
        </div>
        <p className="mt-5 text-xs text-white/55">Try it instantly: brand@demo.com or creator1@demo.com · password demo1234</p>
      </div>
      {/* floating collage */}
      <div className="pointer-events-none relative z-0 mt-8 h-64 sm:h-72" aria-hidden="true">
        {[["work_0_0.jpg", "left-[2%] top-6 w-[30%]", "-6deg", "0s"], ["work_6_0.jpg", "left-[33%] top-0 w-[32%]", "4deg", "1.2s"], ["work_1_0.jpg", "left-[66%] top-8 w-[30%]", "-3deg", "2.2s"]].map(([f, pos, rot, delay]) => (
          <img key={f} src={demo(f)} alt="" style={{ "--r": rot, animationDelay: delay } as React.CSSProperties} className={`absolute ${pos} aspect-[4/5] animate-float rounded-2xl border border-white/30 object-cover shadow-2xl`} />))}
        <div className="absolute bottom-1 left-[8%] flex animate-float items-center gap-2 rounded-2xl border border-white/25 bg-white/15 px-3.5 py-2.5 backdrop-blur-xl" style={{ animationDelay: "1.6s" } as React.CSSProperties}>
          <span className="text-2xl font-extrabold">92%</span><span className="text-[11px] leading-tight text-white/80">match<br />Runway · Midjourney</span>
        </div>
      </div>
      <ul className="relative z-10 mt-8 grid gap-3 text-sm sm:grid-cols-3">
        {[["sparkle", "AI-tagged portfolios", "Style, mood and tools detected for every piece."], ["briefcase", "Briefs in one line", "AI asks the missing questions and builds the brief."], ["star", "Explainable matches", "Score bars, evidence and one honest risk."]].map(([i, t, d]) => (
          <li key={t} className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md"><Icon name={i} className="mb-1.5 h-5 w-5 text-sky-200" /><div className="font-semibold">{t}</div><div className="mt-0.5 text-xs text-white/65">{d}</div></li>))}
      </ul>
    </section>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  return (
    <AppShell>
      {loading ? <PostSkeleton /> : <>{!user && <Landing />}<Feed /></>}
    </AppShell>
  );
}
