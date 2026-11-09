import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ScrollActivity } from "@/components/ScrollActivity";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Devsolutionspk Sales CRM", template: "%s · Devsolutionspk Sales CRM" },
  description: "Outreach CRM for 8staros POS and Star Cellular Wholesale",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Script id="theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        <ScrollActivity />
        {children}
      </body>
    </html>
  );
}
