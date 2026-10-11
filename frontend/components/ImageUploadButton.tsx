"use client";
import { ReactNode, useRef, useState } from "react";
import { uploadMedia, ImageKind } from "@/lib/upload";
import { useToast } from "./Providers";
import { Spinner } from "./ui";

/** Button that opens a file picker, resizes + uploads an image with progress, then reports the stored URL. */
export default function ImageUploadButton({ kind, onUploaded, children, className, ariaLabel }: {
  kind: ImageKind; onUploaded: (url: string) => void | Promise<void>; children: ReactNode; className?: string; ariaLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [pct, setPct] = useState<number | null>(null);
  async function pick(file: File) {
    setPct(0);
    try {
      const r = await uploadMedia(file, kind, setPct);
      if (r.type !== "image") throw new Error("Please choose an image file.");
      await onUploaded(r.url);
    } catch (e) { toast(e instanceof Error ? e.message : "Upload failed", "error"); } finally { setPct(null); }
  }
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      <button type="button" className={className} aria-label={ariaLabel} disabled={pct !== null} onClick={() => input.current?.click()}>
        {pct !== null ? <><Spinner /><span className="text-xs tabular-nums">{pct}%</span></> : children}
      </button>
    </>
  );
}
