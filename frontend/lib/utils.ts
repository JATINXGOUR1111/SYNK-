export function cn(...c: (string | false | null | undefined)[]): string { return c.filter(Boolean).join(" "); }

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export function inrShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`;
  if (n >= 1000) return `₹${Math.round(n / 100) / 10}k`;
  return `₹${n}`;
}

export function budgetLabel(b: { min: number | null; max: number | null } | null | undefined): string | null {
  if (!b || (b.min === null && b.max === null)) return null;
  if (b.min !== null && b.max !== null) return `${inrShort(b.min)} – ${inrShort(b.max)}`;
  return `Up to ${inrShort(b.max ?? b.min)}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export const MEDIUMS = ["image", "video", "audio", "design"];
export const TOOL_OPTIONS = ["Midjourney", "Runway", "Sora", "Pika", "Kling", "Luma", "Veo", "Stable Diffusion", "ComfyUI", "Flux", "DALL-E",
  "Firefly", "Leonardo", "Ideogram", "ElevenLabs", "Suno", "Udio", "HeyGen", "CapCut", "Canva", "Photoshop", "After Effects"];
export const CATEGORY_OPTIONS = ["beauty", "fashion", "food", "tech", "fintech", "real-estate", "jewellery", "travel", "fitness",
  "education", "gaming", "music", "automotive", "healthcare", "packaging", "wellness", "retail", "d2c", "entertainment"];
