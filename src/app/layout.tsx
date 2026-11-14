import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppearanceProvider } from "@/components/appearance/Appearance";

export const metadata: Metadata = {
  title: "Newton — A little guidance. Your own discovery.",
  description:
    "Meet Newton, an AI study companion in development by Twofold. A space to think out loud, work through algebra, and build understanding.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=JSON.parse(localStorage.getItem('newton-appearance')||'null');var m=p&&['light','dark','system'].includes(p.mode)?p.mode:'light';var t=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var r=document.documentElement;r.dataset.theme=t;r.dataset.dimWorksheet=String(!p||p.dim!==false);r.style.colorScheme=t}catch(e){}})()` }} /><AppearanceProvider>{children}</AppearanceProvider></body>
    </html>
  );
}
