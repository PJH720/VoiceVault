import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/layout/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VoiceVault",
    template: "%s · VoiceVault",
  },
  description:
    "AI voice recorder — transcribe, summarize, classify, and search your recordings",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
