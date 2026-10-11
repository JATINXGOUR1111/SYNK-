/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: { ink: { 50: "#f8fafc", 900: "#0f172a", 950: "#07070d" } },
      borderRadius: { "4xl": "2rem" },
      boxShadow: {
        soft: "0 1px 0 rgba(255,255,255,.7) inset, 0 14px 36px -18px rgba(40,24,110,.28)",
        glow: "0 10px 30px -10px rgba(124,58,237,.65)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pop: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.35)" }, "100%": { transform: "scale(1)" } },
        bigheart: { "0%": { opacity: "0", transform: "scale(.4)" }, "30%": { opacity: "1", transform: "scale(1.15)" }, "100%": { opacity: "0", transform: "scale(1)" } },
        toastin: { "0%": { opacity: "0", transform: "translateY(12px) scale(.98)" }, "100%": { opacity: "1", transform: "none" } },
        modalin: { "0%": { opacity: "0", transform: "translateY(18px) scale(.98)" }, "100%": { opacity: "1", transform: "none" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        rise: { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0) rotate(var(--r,0deg))" }, "50%": { transform: "translateY(-10px) rotate(var(--r,0deg))" } },
        gradmove: { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
      },
      animation: {
        pop: "pop .35s ease-out", bigheart: "bigheart .8s ease-out forwards", toastin: "toastin .28s cubic-bezier(.2,.8,.2,1)",
        modalin: "modalin .26s cubic-bezier(.2,.8,.2,1)", fade: "fade .2s ease-out", rise: "rise .55s cubic-bezier(.2,.8,.2,1) both",
        float: "float 7s ease-in-out infinite", gradmove: "gradmove 8s ease infinite",
      },
    },
  },
  plugins: [],
};
