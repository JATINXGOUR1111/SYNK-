export interface TextOverlay {
  text: string;
  font: string; // "Modern" | "Editorial" | "Neon" | "Script" | "Typewriter"
  color: string;
  badge: "none" | "dark" | "white" | "gradient" | "glass";
  position: "top" | "center" | "bottom";
}

export interface FilterPreset {
  id: string;
  name: string;
  css: string;
  classPreview: string;
}

export const FILTERS: FilterPreset[] = [
  { id: "normal", name: "Normal", css: "none", classPreview: "bg-slate-200" },
  { id: "clarendon", name: "Clarendon", css: "contrast(1.25) saturate(1.3) brightness(1.05)", classPreview: "bg-blue-400" },
  { id: "vintage", name: "Vintage", css: "sepia(0.35) contrast(1.1) brightness(1.05) saturate(1.2)", classPreview: "bg-amber-400" },
  { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.4) brightness(0.95)", classPreview: "bg-neutral-800" },
  { id: "cyberpunk", name: "Cyberpunk", css: "hue-rotate(280deg) saturate(1.8) contrast(1.25)", classPreview: "bg-fuchsia-500" },
  { id: "golden", name: "Golden", css: "sepia(0.2) saturate(1.5) contrast(1.1) brightness(1.08)", classPreview: "bg-yellow-500" },
  { id: "lofi", name: "Lo-Fi", css: "saturate(1.4) contrast(1.35) brightness(0.95)", classPreview: "bg-rose-400" },
  { id: "glow", name: "Glow", css: "brightness(1.1) contrast(1.05) saturate(1.2)", classPreview: "bg-indigo-400" },
];

export const FONTS = [
  { id: "Modern", label: "Modern", fontFamily: "Inter, sans-serif" },
  { id: "Editorial", label: "Editorial", fontFamily: "'Playfair Display', serif" },
  { id: "Neon", label: "Neon", fontFamily: "'Bebas Neue', cursive" },
  { id: "Script", label: "Script", fontFamily: "'Caveat', cursive" },
  { id: "Typewriter", label: "Typewriter", fontFamily: "'Space Mono', monospace" },
];

export const TEXT_COLORS = [
  { id: "#FFFFFF", label: "White", bg: "#FFFFFF" },
  { id: "#000000", label: "Black", bg: "#000000" },
  { id: "#F43F5E", label: "Rose", bg: "#F43F5E" },
  { id: "#FBBF24", label: "Gold", bg: "#FBBF24" },
  { id: "#06B6D4", label: "Cyan", bg: "#06B6D4" },
  { id: "#A855F7", label: "Purple", bg: "#A855F7" },
  { id: "#10B981", label: "Green", bg: "#10B981" },
];

export const BADGE_STYLES = [
  { id: "none" as const, label: "Clean" },
  { id: "dark" as const, label: "Dark Pill" },
  { id: "white" as const, label: "White Pill" },
  { id: "gradient" as const, label: "Gradient" },
  { id: "glass" as const, label: "Frosted" },
];

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration?: string;
}

export const PRESET_SOUNDTRACKS: TrackItem[] = [
  { id: "synth", title: "Cyber Synthwave", artist: "AI Audio", url: "/static/demo/track_0.mp3", duration: "0:30" },
  { id: "lofi", title: "Midnight Lofi Coffee", artist: "Chill AI", url: "/static/demo/track_1.mp3", duration: "0:30" },
  { id: "future", title: "Future Bass Energy", artist: "CreatorMatch Beats", url: "/static/demo/track_2.mp3", duration: "0:30" },
];

/**
 * Bakes CSS filters and text overlays directly onto an image canvas
 * and returns a composite File ready for upload.
 */
export async function compositeImage(
  file: File,
  filterCss: string,
  overlay?: TextOverlay
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (filterCss === "none" && (!overlay || !overlay.text.trim())) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);

      // 1. Draw image with filter
      if (filterCss && filterCss !== "none") {
        ctx.filter = filterCss;
      }
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = "none";

      // 2. Draw text overlay if present
      if (overlay && overlay.text.trim()) {
        const text = overlay.text.trim();
        const baseSize = Math.max(28, Math.round(w * 0.055));
        const fontOption = FONTS.find((f) => f.id === overlay.font) || FONTS[0];
        ctx.font = `600 ${baseSize}px ${fontOption.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = baseSize * 1.25;

        // Coordinates
        const centerX = w / 2;
        let centerY = h / 2;
        if (overlay.position === "top") centerY = h * 0.16;
        else if (overlay.position === "bottom") centerY = h * 0.84;

        // Draw Badge Background
        const padX = baseSize * 0.8;
        const padY = baseSize * 0.45;
        const boxX = centerX - textWidth / 2 - padX;
        const boxY = centerY - textHeight / 2 - padY;
        const boxW = textWidth + padX * 2;
        const boxH = textHeight + padY * 2;
        const radius = Math.min(boxH / 2, 20);

        if (overlay.badge !== "none") {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, radius);

          if (overlay.badge === "dark") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
            ctx.fill();
          } else if (overlay.badge === "white") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.fill();
          } else if (overlay.badge === "gradient") {
            const grad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY);
            grad.addColorStop(0, "#7c3aed");
            grad.addColorStop(0.5, "#c026d3");
            grad.addColorStop(1, "#f43f5e");
            ctx.fillStyle = grad;
            ctx.fill();
          } else if (overlay.badge === "glass") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = Math.max(2, Math.round(w * 0.003));
            ctx.stroke();
          }
          ctx.restore();
        }

        // Text drop shadow for contrast
        ctx.save();
        if (overlay.badge === "none") {
          ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
          ctx.shadowBlur = Math.max(8, Math.round(w * 0.015));
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
        }

        // Text fill
        ctx.fillStyle = overlay.badge === "white" && overlay.color === "#FFFFFF" ? "#000000" : overlay.color;
        ctx.fillText(text, centerX, centerY);
        ctx.restore();
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const newName = file.name.replace(/\.[^.]+$/, "") + "-edited.jpg";
          resolve(new File([blob], newName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
