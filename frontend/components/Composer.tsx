"use client";
import { DragEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, uploadForm } from "@/lib/api";
import { checkFile, prepareImage, MAX_MB } from "@/lib/upload";
import type { Post } from "@/lib/types";
import { useToast } from "./Providers";
import { Icon, Modal, Spinner } from "./ui";
import { TOOL_OPTIONS, cn } from "@/lib/utils";

interface Pick { file: File; url: string; type: "image" | "video" | "audio" }
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp4,.mov,.webm,.mp3,.wav,.m4a,.ogg";

export default function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<Pick[]>([]);
  const [caption, setCaption] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(false);
  const [result, setResult] = useState<Post | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) { files.forEach((f) => URL.revokeObjectURL(f.url)); setFiles([]); setCaption(""); setTools([]); setSuggested([]); setResult(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  function add(list: FileList | File[]) {
    const next: Pick[] = [];
    for (const f of Array.from(list)) {
      const bad = checkFile(f);
      if (bad) { toast(bad, "error"); continue; }
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const type = f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? "image" : f.type.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext) ? "video" : "audio";
      next.push({ file: f, url: URL.createObjectURL(f), type });
    }
    setFiles((x) => [...x, ...next].slice(0, 10));
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }
  async function generate() {
    setGen(true);
    try {
      const r = await api.post<{ caption: string; hashtags: string[] }>("/ai/caption", { title: caption.slice(0, 60), description: caption, tools, tags: [] });
      setCaption(r.caption); setSuggested(r.hashtags); toast("Caption generated");
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not generate caption", "error"); } finally { setGen(false); }
  }
  async function submit() {
    if (!files.length && !caption.trim()) { toast("Add a file or a caption", "error"); return; }
    setBusy(true); setPct(0);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f.type === "image" ? await prepareImage(f.file, "post") : f.file);
      fd.append("caption", caption); fd.append("tools", tools.join(","));
      const post = await uploadForm<Post>("/posts", fd, setPct);
      window.dispatchEvent(new CustomEvent("cm:posted", { detail: post }));
      toast("Posted");
      if (post.trust && post.trust.risk_level !== "low") setResult(post); else onClose();
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not post", "error"); } finally { setBusy(false); setPct(null); }
  }

  return (
    <Modal open={open} onClose={onClose} title={result ? "Your post is live" : "New post"} wide>
      {result?.trust ? (
        <div className="space-y-3">
          <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="mb-1 flex items-center gap-2 font-semibold"><Icon name="alert" className="h-4 w-4" />Trust check: {result.trust.risk_level} risk</div>
            {result.trust.flags.length > 0 && <ul className="mb-2 list-disc pl-5">{result.trust.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
            <p>{result.trust.recommendation}</p>
          </div>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            className={cn("rounded-2xl border-2 border-dashed p-4 text-center transition", drag ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-slate-300 dark:border-slate-700")}>
            {files.length === 0 ? (
              <button type="button" className="flex w-full flex-col items-center gap-2 py-8" onClick={() => input.current?.click()}>
                <Icon name="upload" className="h-8 w-8 text-violet-500" /><span className="text-sm font-semibold">Drag and drop or click to upload</span><span className="muted text-xs">Photos, video (MP4, MOV, WEBM) or audio · up to {MAX_MB} MB each · max 10 files</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {files.map((f, i) => (
                  <div key={f.url} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    {f.type === "image" ? <img src={f.url} alt={`Preview ${i + 1}`} className="h-full w-full object-cover" /> : f.type === "video" ? <video src={f.url} muted className="h-full w-full object-cover" aria-label={`Video preview ${i + 1}`} /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name="audio" className="h-8 w-8" /></div>}
                    <button className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label={`Remove file ${i + 1}`} onClick={() => { URL.revokeObjectURL(f.url); setFiles((x) => x.filter((_, j) => j !== i)); }}><Icon name="x" className="h-3 w-3" /></button>
                  </div>))}
                {files.length < 10 && <button className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700" aria-label="Add more files" onClick={() => input.current?.click()}><Icon name="plus" /></button>}
              </div>)}
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><label htmlFor="cap" className="label !mb-0">Caption</label>
              <button type="button" className="btn-ghost btn-sm !text-violet-600" onClick={generate} disabled={gen}>{gen ? <Spinner /> : <Icon name="sparkle" className="h-4 w-4" />}Generate caption with AI</button></div>
            <textarea id="cap" className="input min-h-[96px]" maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Describe the piece. Use #hashtags and @mentions." />
            {suggested.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested hashtags">{suggested.map((h) => <button key={h} type="button" className="chip hover:bg-violet-100 dark:hover:bg-violet-500/20" onClick={() => { if (!caption.includes(h)) setCaption((c) => `${c.trim()} ${h}`); }}>{h}</button>)}</div>}
          </div>
          <div>
            <span className="label">Tools used</span>
            <div className="flex flex-wrap gap-1.5">{TOOL_OPTIONS.map((t) => (
              <button type="button" key={t} aria-pressed={tools.includes(t)} onClick={() => setTools((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition", tools.includes(t) ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 hover:border-violet-400 dark:border-slate-700")}>{t}</button>))}</div>
            <p className="muted mt-1 text-xs">Disclosing tools builds trust with brands.</p>
          </div>
          <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? <><Spinner /> {pct !== null && pct < 100 ? `Uploading ${pct}%` : "Analysing and posting…"}</> : "Post"}</button>
          {busy && pct !== null && <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-label="Upload progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} /></div>}
        </div>)}
    </Modal>
  );
}
