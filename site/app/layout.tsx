import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/site/providers";
import { SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "Elmory: memory for coding agents that checks the code";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: TITLE, template: "%s | Elmory" },
  description: SITE.description,
  keywords: [
    "coding agent memory",
    "MCP memory server",
    "AI agent memory",
    "Claude Code memory",
    "stale memory",
    "open source",
  ],
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "Elmory", title: TITLE, description: SITE.description },
  twitter: { card: "summary_large_image", title: TITLE, description: SITE.description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ece3" },
    { media: "(prefers-color-scheme: dark)", color: "#131910" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
