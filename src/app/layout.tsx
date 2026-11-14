import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newton — A little guidance. Your own discovery.",
  description:
    "Meet Newton, an AI study companion in development by Twofold. A space to think out loud, work through algebra, and build understanding.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
