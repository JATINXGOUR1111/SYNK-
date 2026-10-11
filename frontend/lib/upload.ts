import { uploadForm } from "./api";

export const MAX_MB = 100;
export type ImageKind = "avatar" | "banner" | "post";

export interface Uploaded { url: string; type: "image" | "video" | "audio" }

const LIMITS: Record<ImageKind, { w: number; h: number; crop: boolean }> = {
  avatar: { w: 640, h: 640, crop: true },
  banner: { w: 1800, h: 600, crop: false },
  post: { w: 2400, h: 2400, crop: false },
};

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
    img.src = url;
  });
}

/** Resize/compress an image in the browser (faster uploads, avoids size limits). GIFs are left untouched. */
export async function prepareImage(file: File, kind: ImageKind): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (kind === "post" && file.size < 3 * 1024 * 1024) return file;
  try {
    const img = await load(file);
    const lim = LIMITS[kind];
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight, dw: number, dh: number;
    if (lim.crop) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; dw = dh = Math.min(lim.w, s); }
    else { const k = Math.min(1, lim.w / sw, lim.h / sh); dw = Math.round(sw * k); dh = Math.round(sh * k); }
    const c = document.createElement("canvas"); c.width = dw; c.height = dh;
    const ctx = c.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size && kind === "post") return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC on Chrome: let the server decide
  }
}

export function checkFile(file: File): string | null {
  const t = file.type.toLowerCase();
  if (/heic|heif/.test(t) || /\.(heic|heif)$/i.test(file.name)) return "HEIC photos are not supported. Export the photo as JPG or PNG first.";
  const okExt = /\.(jpe?g|png|webp|gif|mp4|mov|webm|mp3|wav|ogg|m4a)$/i.test(file.name);
  if (!/^(image|video|audio)\//.test(t) && !okExt) return `${file.name}: unsupported file type.`;
  if (file.size > MAX_MB * 1024 * 1024) return `${file.name} is larger than ${MAX_MB} MB.`;
  return null;
}

export async function uploadMedia(file: File, kind: ImageKind, onProgress?: (pct: number) => void): Promise<Uploaded> {
  const err = checkFile(file);
  if (err) throw new Error(err);
  const f = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name) ? await prepareImage(file, kind) : file;
  const fd = new FormData();
  fd.append("file", f);
  return uploadForm<Uploaded>("/uploads", fd, onProgress);
}
