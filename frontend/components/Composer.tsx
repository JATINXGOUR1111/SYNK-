"use client";
import { DragEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, uploadForm, mediaUrl } from "@/lib/api";
import { checkFile, prepareImage, MAX_MB } from "@/lib/upload";
import type { Post } from "@/lib/types";
import { useToast } from "./Providers";
import { Icon, Modal, Spinner } from "./ui";
import { TOOL_OPTIONS, cn } from "@/lib/utils";
import {
  FILTERS,
  FONTS,
  TEXT_COLORS,
  BADGE_STYLES,
  PRESET_SOUNDTRACKS,
  TextOverlay,
  compositeImage,
  TrackItem,
} from "@/lib/studio";

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
  const audioInput = useRef<HTMLInputElement>(null);

  // Studio Mode State
  const [format, setFormat] = useState<"feed" | "story">("feed");
  const [activeTab, setActiveTab] = useState<"none" | "filters" | "text" | "music">("filters");
  const [activeFilter, setActiveFilter] = useState("normal");
  const [overlay, setOverlay] = useState<TextOverlay>({
    text: "",
    font: "Modern",
    color: "#FFFFFF",
    badge: "dark",
    position: "center",
  });
  const [selectedMusic, setSelectedMusic] = useState<TrackItem | null>(null);
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [playingAudio, setPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      files.forEach((f) => URL.revokeObjectURL(f.url));
      setFiles([]);
      setCaption("");
      setTools([]);
      setSuggested([]);
      setResult(null);
      setActiveFilter("normal");
      setOverlay({ text: "", font: "Modern", color: "#FFFFFF", badge: "dark", position: "center" });
      setSelectedMusic(null);
      setCustomAudioFile(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudio(false);
    }
  }, [open]);

  // Audio preview playback
  useEffect(() => {
    if (!selectedMusic) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudio(false);
      return;
    }

    const soundUrl = selectedMusic.url.startsWith("blob:") ? selectedMusic.url : mediaUrl(selectedMusic.url);
    const audio = new Audio(soundUrl);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudio(false);
    audio.onerror = () => setPlayingAudio(false);

    return () => {
      audio.pause();
    };
  }, [selectedMusic]);

  function togglePlayMusic() {
    if (!audioRef.current) return;
    if (playingAudio) {
      audioRef.current.pause();
      setPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setPlayingAudio(true)).catch(() => setPlayingAudio(false));
    }
  }

  function add(list: FileList | File[]) {
    const next: Pick[] = [];
    for (const f of Array.from(list)) {
      const bad = checkFile(f);
      if (bad) { toast(bad, "error"); continue; }
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const type = f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
        ? "image"
        : f.type.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)
        ? "video"
        : "audio";

      if (type === "audio") {
        // Automatically select as soundtrack
        setSelectedMusic({
          id: "custom-" + Date.now(),
          title: f.name.replace(/\.[^.]+$/, ""),
          artist: "My Audio",
          url: URL.createObjectURL(f),
        });
        setCustomAudioFile(f);
        toast("Attached as background soundtrack", "success");
      } else {
        next.push({ file: f, url: URL.createObjectURL(f), type });
      }
    }
    if (next.length) {
      setFiles((x) => [...x, ...next].slice(0, 10));
    }
  }

  function handleCustomAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    const bad = checkFile(f);
    if (bad) { toast(bad, "error"); return; }
    setSelectedMusic({
      id: "uploaded-" + Date.now(),
      title: f.name.replace(/\.[^.]+$/, ""),
      artist: "Uploaded Track",
      url: URL.createObjectURL(f),
    });
    setCustomAudioFile(f);
    toast("Music attached!", "success");
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    add(e.dataTransfer.files);
  }

  async function generate() {
    setGen(true);
    try {
      const r = await api.post<{ caption: string; hashtags: string[] }>("/ai/caption", {
        title: caption.slice(0, 60),
        description: caption,
        tools,
        tags: [],
      });
      setCaption(r.caption);
      setSuggested(r.hashtags);
      toast("Caption generated");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not generate caption", "error");
    } finally {
      setGen(false);
    }
  }

  async function submit() {
    if (!files.length && !caption.trim()) {
      toast("Add a photo, video or caption", "error");
      return;
    }
    setBusy(true);
    setPct(0);
    try {
      const fd = new FormData();
      const currentFilter = FILTERS.find((f) => f.id === activeFilter)?.css || "none";

      // 1. Process files (bake filter and text overlay if image)
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        if (item.type === "image") {
          // If edited with filter or text, composite onto canvas
          let finalFile = item.file;
          if (currentFilter !== "none" || overlay.text.trim()) {
            finalFile = await compositeImage(item.file, currentFilter, overlay);
          }
          fd.append("files", await prepareImage(finalFile, "post"));
        } else {
          fd.append("files", item.file);
        }
      }

      // 2. Attach background soundtrack if selected
      if (customAudioFile) {
        fd.append("files", customAudioFile);
      } else if (selectedMusic && selectedMusic.url.startsWith("/static/")) {
        try {
          const res = await fetch(mediaUrl(selectedMusic.url));
          const blob = await res.blob();
          const soundtrackFile = new File([blob], `${selectedMusic.id}.mp3`, { type: "audio/mpeg" });
          fd.append("files", soundtrackFile);
        } catch {
          /* ignore audio fetch failure */
        }
      }

      // 3. Caption, tools & hashtag tags
      let finalCaption = caption;
      if (selectedMusic && !finalCaption.includes("🎵")) {
        finalCaption = finalCaption ? `${finalCaption}\n\n🎵 ${selectedMusic.title}` : `🎵 ${selectedMusic.title}`;
      }
      fd.append("caption", finalCaption);
      fd.append("tools", tools.join(","));

      const post = await uploadForm<Post>("/posts", fd, setPct);
      window.dispatchEvent(new CustomEvent("cm:posted", { detail: post }));
      toast("Post published successfully!", "success");
      if (post.trust && post.trust.risk_level !== "low") setResult(post);
      else onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not post", "error");
    } finally {
      setBusy(false);
      setPct(null);
    }
  }

  const activeCssFilter = FILTERS.find((f) => f.id === activeFilter)?.css || "none";
  const activeFontFamily = FONTS.find((f) => f.id === overlay.font)?.fontFamily || "Inter, sans-serif";
  const previewItem = files[0];

  return (
    <Modal open={open} onClose={onClose} title={result ? "Your post is live" : "Create Post"} wide>
      {result?.trust ? (
        <div className="space-y-3">
          <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <Icon name="alert" className="h-4 w-4" />
              Trust check: {result.trust.risk_level} risk
            </div>
            {result.trust.flags.length > 0 && (
              <ul className="mb-2 list-disc pl-5">
                {result.trust.flags.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
            <p>{result.trust.recommendation}</p>
          </div>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Format Switcher (Feed vs Story) */}
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-white/10">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("feed")}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  format === "feed"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                )}
              >
                📸 Post Feed (1:1)
              </button>
              <button
                type="button"
                onClick={() => setFormat("story")}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  format === "story"
                    ? "bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                )}
              >
                ⚡ Story Mode (9:16)
              </button>
            </div>

            {files.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "filters" ? "none" : "filters")}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1",
                    activeTab === "filters"
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  )}
                >
                  🎨 Filters
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "text" ? "none" : "text")}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1",
                    activeTab === "text"
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  )}
                >
                  Aa Text
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "music" ? "none" : "music")}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1",
                    activeTab === "music" || selectedMusic
                      ? "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-fuchsia-500/30"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  )}
                >
                  🎵 Music
                </button>
              </div>
            )}
          </div>

          {/* Interactive Media Canvas / Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={cn(
              "relative overflow-hidden rounded-2xl border-2 transition text-center",
              drag ? "border-violet-500 bg-violet-50/50 dark:bg-violet-500/10" : "border-slate-200 dark:border-white/10"
            )}
          >
            {files.length === 0 ? (
              <button
                type="button"
                className="flex w-full flex-col items-center gap-2.5 py-12 px-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                onClick={() => input.current?.click()}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow">
                  <Icon name="upload" className="h-6 w-6" />
                </div>
                <span className="text-sm font-bold">Drag & drop or click to upload</span>
                <span className="muted text-xs max-w-sm">
                  Photos, video (MP4, MOV, WEBM) or audio · up to {MAX_MB} MB each · filters & music studio included
                </span>
              </button>
            ) : (
              <div className="space-y-3 p-3">
                {/* Main Interactive Studio Preview */}
                <div
                  className={cn(
                    "relative mx-auto overflow-hidden rounded-2xl bg-black transition-all shadow-xl",
                    format === "story" ? "aspect-[9/16] max-h-[460px] w-auto" : "aspect-[4/5] max-h-[400px] w-auto"
                  )}
                >
                  {previewItem.type === "image" ? (
                    <img
                      src={previewItem.url}
                      alt="Preview"
                      style={{ filter: activeCssFilter }}
                      className="h-full w-full object-cover transition-all duration-300"
                    />
                  ) : previewItem.type === "video" ? (
                    <video
                      src={previewItem.url}
                      muted
                      autoPlay
                      loop
                      playsInline
                      style={{ filter: activeCssFilter }}
                      className="h-full w-full object-cover"
                      aria-label="Video preview"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white">
                      <Icon name="audio" className="h-12 w-12" />
                    </div>
                  )}

                  {/* Live Text Overlay (Instagram Story Style) */}
                  {overlay.text.trim() && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-3 z-10 flex justify-center transition-all",
                        overlay.position === "top" ? "top-6" : overlay.position === "bottom" ? "bottom-6" : "top-1/2 -translate-y-1/2"
                      )}
                    >
                      <span
                        style={{
                          fontFamily: activeFontFamily,
                          color: overlay.badge === "white" && overlay.color === "#FFFFFF" ? "#000000" : overlay.color,
                        }}
                        className={cn(
                          "max-w-[90%] text-center text-xl font-bold tracking-tight transition-all",
                          overlay.badge === "dark" && "rounded-2xl bg-black/75 px-4 py-2 backdrop-blur-md shadow-lg",
                          overlay.badge === "white" && "rounded-2xl bg-white/95 px-4 py-2 shadow-lg",
                          overlay.badge === "gradient" && "rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 px-4 py-2 text-white shadow-xl",
                          overlay.badge === "glass" && "rounded-2xl border border-white/40 bg-white/25 px-4 py-2 text-white backdrop-blur-md shadow-lg",
                          overlay.badge === "none" && "drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
                        )}
                      >
                        {overlay.text}
                      </span>
                    </div>
                  )}

                  {/* Attached Music Badge Overlay */}
                  {selectedMusic && (
                    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md shadow-lg">
                      <button
                        type="button"
                        onClick={togglePlayMusic}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/40"
                      >
                        <Icon name={playingAudio ? "pause" : "play"} className="h-3 w-3" />
                      </button>
                      <span className="truncate max-w-[140px]">🎵 {selectedMusic.title}</span>
                    </div>
                  )}

                  {/* Change/Remove Photo Button */}
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(previewItem.url);
                      setFiles([]);
                    }}
                    className="absolute right-2.5 top-2.5 z-20 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
                    aria-label="Remove photo"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={audioInput}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              hidden
              onChange={handleCustomAudioUpload}
            />
          </div>

          {/* Studio Panel: Filters, Text, Music */}
          {files.length > 0 && activeTab === "filters" && (
            <div className="card space-y-2.5 p-3.5 bg-slate-50/70 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filters</span>
                <span className="text-xs text-violet-600 dark:text-violet-400 font-semibold capitalize">{activeFilter}</span>
              </div>
              <div className="hide-scroll flex gap-2.5 overflow-x-auto pb-1">
                {FILTERS.map((flt) => (
                  <button
                    type="button"
                    key={flt.id}
                    onClick={() => setActiveFilter(flt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 shrink-0 rounded-xl p-1.5 transition",
                      activeFilter === flt.id
                        ? "bg-violet-500/10 ring-2 ring-violet-500 text-violet-700 dark:text-violet-300"
                        : "hover:bg-slate-200/60 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <div className={cn("h-11 w-11 rounded-lg border border-white/20 shadow-sm", flt.classPreview)} />
                    <span className="text-[11px] font-medium">{flt.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && activeTab === "text" && (
            <div className="card space-y-3 p-3.5 bg-slate-50/70 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Instagram Story Text</span>
                {overlay.text && (
                  <button
                    type="button"
                    onClick={() => setOverlay({ ...overlay, text: "" })}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Clear text
                  </button>
                )}
              </div>

              {/* Text Input */}
              <input
                type="text"
                className="input !py-2 text-sm"
                placeholder="Write text on your photo/story..."
                value={overlay.text}
                onChange={(e) => setOverlay({ ...overlay, text: e.target.value })}
              />

              {/* Font Style Selection */}
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Fonts</span>
                <div className="flex flex-wrap gap-1.5">
                  {FONTS.map((font) => (
                    <button
                      type="button"
                      key={font.id}
                      onClick={() => setOverlay({ ...overlay, font: font.id })}
                      style={{ fontFamily: font.fontFamily }}
                      className={cn(
                        "rounded-xl border px-3 py-1 text-xs font-bold transition",
                        overlay.font === font.id
                          ? "border-violet-500 bg-violet-500 text-white shadow-sm"
                          : "border-slate-300 bg-white dark:border-white/10 dark:bg-white/5 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Badge & Color controls */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Badge</span>
                  <div className="flex flex-wrap gap-1">
                    {BADGE_STYLES.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => setOverlay({ ...overlay, badge: b.id })}
                        className={cn(
                          "rounded-lg px-2 py-0.5 text-[11px] font-semibold border transition",
                          overlay.badge === b.id
                            ? "border-violet-500 bg-violet-500 text-white"
                            : "border-slate-200 dark:border-white/10"
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Color</span>
                  <div className="flex items-center gap-1.5">
                    {TEXT_COLORS.map((col) => (
                      <button
                        type="button"
                        key={col.id}
                        onClick={() => setOverlay({ ...overlay, color: col.id })}
                        style={{ backgroundColor: col.bg }}
                        className={cn(
                          "h-5 w-5 rounded-full border border-slate-300 shadow-xs transition",
                          overlay.color === col.id ? "ring-2 ring-violet-500 ring-offset-1 scale-110" : "hover:scale-105"
                        )}
                        aria-label={col.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Position Switcher */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-white/5 text-xs">
                <span className="font-semibold text-slate-500">Position:</span>
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    type="button"
                    key={pos}
                    onClick={() => setOverlay({ ...overlay, position: pos })}
                    className={cn(
                      "rounded-lg px-2.5 py-1 capitalize font-medium transition",
                      overlay.position === pos
                        ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                        : "hover:bg-slate-200 dark:hover:bg-white/10"
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && activeTab === "music" && (
            <div className="card space-y-3 p-3.5 bg-slate-50/70 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Post Soundtrack</span>
                {selectedMusic && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMusic(null);
                      setCustomAudioFile(null);
                    }}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Remove music
                  </button>
                )}
              </div>

              {/* Preset tracks */}
              <div className="space-y-1.5">
                {PRESET_SOUNDTRACKS.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedMusic(t);
                      setCustomAudioFile(null);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition border",
                      selectedMusic?.id === t.id
                        ? "border-violet-500 bg-violet-500/10 shadow-sm"
                        : "border-slate-200/70 hover:border-violet-300 dark:border-white/10 dark:hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs">
                        🎵
                      </span>
                      <div>
                        <div className="text-xs font-semibold">{t.title}</div>
                        <div className="muted text-[11px]">{t.artist}</div>
                      </div>
                    </div>
                    {selectedMusic?.id === t.id && (
                      <span className="text-xs font-bold text-violet-600 dark:text-violet-400">Selected</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Upload Custom Audio Track */}
              <button
                type="button"
                onClick={() => audioInput.current?.click()}
                className="btn-outline btn-sm w-full gap-2 !border-dashed"
              >
                <Icon name="upload" className="h-3.5 w-3.5" />
                Upload custom song / beat (.mp3, .wav)
              </button>
            </div>
          )}

          {/* Caption & AI Generator */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="cap" className="label !mb-0">Caption</label>
              <button
                type="button"
                className="btn-ghost btn-sm !text-violet-600 font-semibold"
                onClick={generate}
                disabled={gen}
              >
                {gen ? <Spinner /> : <Icon name="sparkle" className="h-4 w-4" />}
                Generate caption with AI
              </button>
            </div>
            <textarea
              id="cap"
              className="input min-h-[88px]"
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Describe the piece. Use #hashtags and @mentions."
            />
            {suggested.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested hashtags">
                {suggested.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="chip hover:bg-violet-100 dark:hover:bg-violet-500/20"
                    onClick={() => {
                      if (!caption.includes(h)) setCaption((c) => `${c.trim()} ${h}`);
                    }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tools Used (Tags) */}
          <div>
            <span className="label">Tools used</span>
            <div className="flex flex-wrap gap-1.5">
              {TOOL_OPTIONS.map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={tools.includes(t)}
                  onClick={() => setTools((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    tools.includes(t)
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-slate-300 hover:border-violet-400 dark:border-slate-700"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="muted mt-1 text-xs">Disclosing tools builds trust with brands.</p>
          </div>

          {/* Submit Post Button */}
          <button className="btn-primary w-full !py-3 font-bold" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> {pct !== null && pct < 100 ? `Uploading ${pct}%` : "Publishing with filters & soundtrack…"}
              </>
            ) : format === "story" ? (
              "Post Story ⚡"
            ) : (
              "Post to Feed 🚀"
            )}
          </button>
          {busy && pct !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
