"use client";
import { useTheme } from "./Providers";
import { Icon } from "./ui";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="icon-btn" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "dark"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
