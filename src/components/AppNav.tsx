"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  ShieldCheck,
  Ticket,
  Webhook,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface AppNavProps {
  organizationName?: string;
  organizationSlug?: string;
  userEmail?: string;
  role?: string;
  sseConnected?: boolean;
}

export function AppNav({
  organizationName,
  organizationSlug,
  userEmail,
  role,
  sseConnected,
}: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/dashboard", label: "Operação CCO", icon: LayoutDashboard },
    {
      href: organizationSlug ? `/tv?org=${organizationSlug}` : "/tv",
      label: "Painel TV",
      icon: MonitorPlay,
    },
    {
      href: organizationSlug ? `/portal?org=${organizationSlug}` : "/portal",
      label: "Totem Cliente",
      icon: Ticket,
    },
    { href: "/webhooks", label: "Webhooks HMAC", icon: Webhook },
    { href: "/auditoria", label: "Auditoria & RBAC", icon: ShieldCheck },
  ];

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070b12]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-slate-100 hover:text-cyan-300 transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-400">
              <Activity className="h-4 w-4" />
            </span>
            <span className="font-bold tracking-tight text-base">
              Pulse<span className="text-cyan-400">Queue</span>
            </span>
          </Link>

          {organizationName && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs">
              <span className="text-slate-400">Tenant:</span>
              <span className="font-semibold text-slate-100">
                {organizationName}
              </span>
              {role && (
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                    role === "ADMIN"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {role}
                </span>
              )}
            </div>
          )}

          {typeof sseConnected === "boolean" && (
            <span
              data-testid="sse-status"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium border ${
                sseConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  sseConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-slate-500"
                }`}
              />
              {sseConnected ? "SSE Tempo Real" : "Conectando SSE"}
            </span>
          )}
        </div>

        <nav className="flex flex-wrap items-center gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href.split("?")[0];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 border border-transparent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {userEmail ? (
            <button
              type="button"
              onClick={handleSignOut}
              title={`Sair (${userEmail})`}
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
