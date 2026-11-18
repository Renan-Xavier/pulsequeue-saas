"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { AppNav } from "@/components/AppNav";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface MemberEntry {
  id: string;
  role: string;
  name: string;
  email: string;
}

interface AuditPayload {
  role: string;
  userEmail: string;
  organization: { id: string; name: string; slug: string; plan: string };
  logs: AuditEntry[];
  members: MemberEntry[];
}

export default function AuditPage() {
  const router = useRouter();
  const [data, setData] = useState<AuditPayload | null>(null);

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/audit", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    const init = async () => {
      await loadAudit();
    };
    void init();
  }, [loadAudit]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <AppNav
        organizationName={data?.organization.name}
        organizationSlug={data?.organization.slug}
        userEmail={data?.userEmail}
        role={data?.role}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" />
            Governança Multi-Tenant &amp; RBAC
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
            Trilha de Auditoria Imutável &amp; Membros do Workspace
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.4fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe &amp; Papéis (RBAC)
            </h2>
            <div className="space-y-3">
              {data?.members.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-sm text-white">{m.name}</p>
                    <p className="font-mono text-xs text-slate-400">{m.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold border ${
                      m.role === "ADMIN"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-4">
              Eventos Auditados (Últimos 50 registros do Tenant)
            </h2>
            <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {data?.logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-cyan-300">
                      {log.action}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Ator:{" "}
                    <span className="font-mono text-white">
                      {log.actorEmail}
                    </span>{" "}
                    · Entidade:{" "}
                    <span className="font-mono text-slate-400">
                      {log.entityType}:{log.entityId.slice(0, 14)}
                    </span>
                  </div>
                  <pre className="rounded-lg bg-slate-900/80 p-2 font-mono text-[10px] text-slate-400 overflow-x-auto">
                    {JSON.stringify(log.metadata)}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
