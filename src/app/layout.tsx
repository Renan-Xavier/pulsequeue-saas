import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PulseQueue // SaaS Multi-Tenant de Filas, SLA & Webhooks em Tempo Real",
  description:
    "Plataforma Full Stack B2B Multi-Tenant construída com Next.js 16, TypeScript, Drizzle ORM, Neon PostgreSQL, Better Auth, SSE e Webhooks HMAC-SHA256 idempotentes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#070b12] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-100">
        {children}
      </body>
    </html>
  );
}
