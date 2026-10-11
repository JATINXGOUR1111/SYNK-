import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "CreatorMatch · The marketplace for AI creators",
  description: "Post AI-made work, build a following and get hired. Brands post briefs and get AI-matched with the best creators in minutes.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const themeScript = `(function(){try{var t=localStorage.getItem('cm-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@600&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,600&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
