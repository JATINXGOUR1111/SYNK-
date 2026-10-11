"""Generates the offline demo media in app/static/demo (committed, so end users do not need ffmpeg).
Run:  python scripts/make_demo_media.py"""
import math, os, random, subprocess, wave
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "app", "static", "demo")
os.makedirs(OUT, exist_ok=True)
H = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

PALETTES = {
    "beauty": ["#ffd1dc", "#ff8fa3", "#ffb38a", "#fff1eb"], "jewellery": ["#120d03", "#c9a227", "#f5d77a", "#3b2a06"],
    "audio": ["#1e1b4b", "#7c3aed", "#22d3ee", "#f0abfc"], "food": ["#f97316", "#fde68a", "#b45309", "#fff7ed"],
    "architecture": ["#0f766e", "#94a3b8", "#e2e8f0", "#0ea5e9"], "tech": ["#020617", "#2563eb", "#22d3ee", "#a78bfa"],
    "wellness": ["#a3b18a", "#dad7cd", "#588157", "#fefae0"], "fashion": ["#be185d", "#fb7185", "#fde68a", "#4c1d95"],
    "travel": ["#f97316", "#ec4899", "#6366f1", "#fde047"], "fitness": ["#111827", "#ef4444", "#f97316", "#fbbf24"],
    "education": ["#1d4ed8", "#60a5fa", "#fde047", "#f0f9ff"], "neon": ["#0b0221", "#d946ef", "#22d3ee", "#facc15"],
}

def blobs(w, h, pal, rng, n=7, blur=0.12):
    img = Image.new("RGB", (w, h), H(pal[0]))
    top, bot = np.array(H(pal[0]), float), np.array(H(pal[3]), float)
    grad = (top[None, None] * (1 - np.linspace(0, 1, h)[:, None, None]) + bot[None, None] * np.linspace(0, 1, h)[:, None, None])
    img = Image.fromarray(np.repeat(grad, w, axis=1).astype("uint8"))
    for _ in range(n):
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
        r = int(rng.uniform(.18, .5) * max(w, h)); x, y = rng.randint(-r // 3, w + r // 3), rng.randint(-r // 3, h + r // 3)
        c = H(rng.choice(pal[1:3] + [pal[3]])); d.ellipse([x - r, y - r, x + r, y + r], fill=c + (int(rng.uniform(110, 210)),))
        img = Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(w * blur))).convert("RGB")
    return img

def shade(d, box, c, kind="ellipse", radius=0):
    getattr(d, "ellipse" if kind == "ellipse" else "rounded_rectangle")(box, fill=c, **({"radius": radius} if kind != "ellipse" else {}))

def hero_object(img, pal, rng, seed):
    w, h = img.size; S = 2
    big = img.resize((w * S, h * S)); layer = Image.new("RGBA", big.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    cx, cy = w * S // 2, int(h * S * .56); a, b, c = H(pal[1]), H(pal[2]), H(pal[3]); kind = seed % 5
    sh = Image.new("RGBA", big.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    if kind == 0:  # glass orb
        r = int(w * S * .27); sd.ellipse([cx - r, cy + r - 30, cx + r, cy + r + 80], fill=(0, 0, 0, 110))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=a + (240,))
        d.ellipse([cx - r * .9, cy - r * .95, cx - r * .2, cy - r * .3], fill=(255, 255, 255, 150))  # soft specular
        d.ellipse([cx - r * .1, cy + r * .1, cx + r * .95, cy + r * .95], fill=b + (90,))        # bounce light
        layer = layer.filter(ImageFilter.GaussianBlur(14)); d = ImageDraw.Draw(layer)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 120), width=4)
    elif kind == 1:  # bottle
        bw, bh = int(w * S * .26), int(h * S * .42); sd.ellipse([cx - bw, cy + bh // 2 - 10, cx + bw, cy + bh // 2 + 60], fill=(0, 0, 0, 100))
        d.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2], radius=60, fill=a + (240,))
        d.rounded_rectangle([cx - bw // 4, cy - bh // 2 - 90, cx + bw // 4, cy - bh // 2 + 10], radius=24, fill=b + (255,))
        d.rounded_rectangle([cx - bw // 2 + 26, cy - bh // 2 + 40, cx - bw // 2 + 60, cy + bh // 2 - 40], radius=16, fill=(255, 255, 255, 110))
    elif kind == 2:  # rings
        for i, r in enumerate([int(w * S * k) for k in (.3, .22, .14)]):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(a, b, c)[i] + (255,), width=34 - i * 8)
    elif kind == 3:  # arch
        aw, ah = int(w * S * .5), int(h * S * .5)
        d.rounded_rectangle([cx - aw // 2, cy - ah // 2, cx + aw // 2, cy + ah // 2 + 100], radius=aw // 2, fill=a + (235,))
        d.rounded_rectangle([cx - aw // 3, cy - ah // 2 + aw // 6, cx + aw // 3, cy + ah // 2 + 100], radius=aw // 3, fill=b + (255,))
    else:  # stacked cards
        for i in range(3):
            o = (i - 1) * 70; cw = int(w * S * .46)
            sd.rounded_rectangle([cx - cw // 2 + o + 20, cy - cw + 40, cx + cw // 2 + o + 20, cy + cw // 2 + 40], radius=50, fill=(0, 0, 0, 60))
            d.rounded_rectangle([cx - cw // 2 + o, cy - cw + o // 3, cx + cw // 2 + o, cy + cw // 2 + o // 3], radius=50, fill=(a, b, c)[i] + (235,), outline=(255, 255, 255, 120), width=4)
    base = Image.alpha_composite(big.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(40)))
    return Image.alpha_composite(base, layer).convert("RGB").resize((w, h), Image.LANCZOS)

def grain(img, amt=7):
    a = np.asarray(img).astype(np.int16) + np.random.RandomState(1).randint(-amt, amt, (img.size[1], img.size[0], 1))
    return Image.fromarray(np.clip(a, 0, 255).astype("uint8"))

def art(name, pal, seed, size=(900, 1125)):
    rng = random.Random(seed); img = blobs(*size, PALETTES[pal], rng); img = hero_object(img, PALETTES[pal], rng, seed)
    grain(img).save(os.path.join(OUT, name), quality=84, optimize=True)

def avatar(name, pal, initial_seed):
    rng = random.Random(initial_seed); s = 320; img = blobs(s, s, PALETTES[pal], rng, n=5, blur=.2); S = 2
    big = img.resize((s * S, s * S)); l = Image.new("RGBA", big.size, (0, 0, 0, 0)); d = ImageDraw.Draw(l)
    d.ellipse([s * S * .33, s * S * .2, s * S * .67, s * S * .54], fill=(255, 255, 255, 215))
    d.ellipse([s * S * .16, s * S * .6, s * S * .84, s * S * 1.3], fill=(255, 255, 255, 185))
    Image.alpha_composite(big.convert("RGBA"), l).convert("RGB").resize((s, s), Image.LANCZOS).save(os.path.join(OUT, name), quality=88)

def banner(name, pal, seed):
    rng = random.Random(seed); grain(blobs(1500, 500, PALETTES[pal], rng, n=8, blur=.1), 5).save(os.path.join(OUT, name), quality=84, optimize=True)

def video(name, pal, seed, secs=6, fps=24, W=540, Hh=960):
    p = [np.array(H(c), float) for c in PALETTES[pal]]; rng = random.Random(seed)
    blobs_ = [(rng.uniform(0, 6.28), rng.uniform(.5, 1.4), rng.uniform(.16, .34), p[1 + i % 3]) for i in range(6)]
    w, h = W // 3, Hh // 3; ys, xs = np.mgrid[0:h, 0:w]; ys, xs = ys / h, xs / w
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{Hh}", "-r", str(fps), "-i", "-",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "veryfast", "-movflags", "+faststart", "-an", os.path.join(OUT, name)]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(secs * fps):
        t = f / fps * 6.283 / secs; frame = p[0][None, None] * (1 - ys[..., None]) + p[3][None, None] * ys[..., None]
        for ph, sp, r, col in blobs_:
            cx, cy = .5 + .38 * math.sin(t * sp + ph), .5 + .38 * math.cos(t * sp * 1.3 + ph); dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
            a = np.clip(1 - dist / r, 0, 1) ** 1.5; frame = frame * (1 - a[..., None] * .8) + col[None, None] * a[..., None] * .8
        pulse = .13 + .02 * math.sin(t * 3); dist = np.sqrt((xs - .5) ** 2 + ((ys - .52) * 1.7) ** 2); ring = np.clip(1 - np.abs(dist - pulse) / .012, 0, 1)
        frame = frame + ring[..., None] * 140; big = cv2.resize(np.clip(frame, 0, 255).astype("uint8"), (W, Hh), interpolation=cv2.INTER_CUBIC)
        pr.stdin.write(big.tobytes())
    pr.stdin.close(); pr.wait()

def audio(name, root, scale, bpm, seed, secs=16, sr=32000):
    rng = random.Random(seed); n = int(secs * sr); out = np.zeros(n); beat = 60 / bpm / 2
    notes = [root * 2 ** (s / 12) for s in scale]
    for i in range(int(secs / beat)):
        f = notes[(i * 3 + rng.randint(0, 2)) % len(notes)] * (2 if i % 4 == 3 else 1); t0 = int(i * beat * sr); L = int(beat * 2.2 * sr); t = np.arange(L) / sr
        env = np.minimum(t * 60, 1) * np.exp(-t * 3.2); tone = np.sin(2 * np.pi * f * t) + .4 * np.sin(4 * np.pi * f * t) + .15 * np.sin(6 * np.pi * f * t)
        seg = tone * env * .22; end = min(n, t0 + L); out[t0:end] += seg[:end - t0]
        if i % 4 == 0:  # bass + soft kick
            b = np.sin(2 * np.pi * (f / 4) * t[:int(beat * 1.8 * sr)]) * np.exp(-t[:int(beat * 1.8 * sr)] * 2.2) * .35; e2 = min(n, t0 + len(b)); out[t0:e2] += b[:e2 - t0]
    d = int(.28 * sr); out[d:] += out[:-d] * .35; out[2 * d:] += out[:-2 * d] * .18
    out = out / (np.abs(out).max() or 1) * .8; fade = int(.4 * sr); out[:fade] *= np.linspace(0, 1, fade); out[-fade:] *= np.linspace(1, 0, fade)
    wavp = os.path.join(OUT, name.replace(".mp3", ".wav"))
    with wave.open(wavp, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr); wf.writeframes((out * 32767).astype("<i2").tobytes())
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wavp, "-b:a", "96k", os.path.join(OUT, name)])
    if r.returncode == 0: os.remove(wavp)

if __name__ == "__main__":
    import sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from app.seed_data import CREATORS, BRANDS, PALETTE_FOR
    for ci, c in enumerate(CREATORS):
        pal = PALETTE_FOR[ci]; avatar(f"avatar_{ci}.jpg", pal, ci + 3); banner(f"banner_{ci}.jpg", pal, ci + 40)
        for wi in range(len(c[-1])): art(f"work_{ci}_{wi}.jpg", pal if wi == 0 else PALETTE_FOR[(ci + wi) % len(PALETTE_FOR)] if False else pal, ci * 10 + wi)
    for bi, pal in enumerate(["beauty", "neon"]): avatar(f"brand_{bi}.jpg", pal, 90 + bi); banner(f"brand_banner_{bi}.jpg", pal, 95 + bi)
    for i, pal in enumerate(["beauty", "neon", "food", "tech"]): video(f"clip_{i}.mp4", pal, i + 1)
    for i, (root, sc, bpm) in enumerate([(220, [0, 3, 7, 10, 12], 108), (174.6, [0, 2, 4, 7, 9], 96), (261.6, [0, 4, 7, 11, 14], 118)]): audio(f"track_{i}.mp3", root, sc, bpm, i + 7)
    print("done", len(os.listdir(OUT)), "files")
