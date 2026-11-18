"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, MonitorPlay, Ticket } from "lucide-react";

interface PublicQueue {
  id: string;
  name: string;
  prefix: string;
  description: string;
}

interface BoardSummary {
  organization: { id: string; name: string; slug: string; slaTargetMinutes: number };
  availableOrgs: Array<{ name: string; slug: string }>;
  queues: PublicQueue[];
  waiting: Array<{ id: string; ticketCode: string; priority: string }>;
}

function PortalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org") || "techlog-brasil";

  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [queueId, setQueueId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "HIGH" | "NORMAL">(
    "NORMAL"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<{
    ticketCode: string;
    priority: string;
    slaDeadlineAt: string;
  } | null>(null);

  const loadBoard = useCallback(async () => {
    const res = await fetch(
      `/api/public/board?org=${encodeURIComponent(orgSlug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const json: BoardSummary = await res.json();
    setBoard(json);
    setQueueId((prev) =>
      json.queues.some((q) => q.id === prev) ? prev : json.queues[0]?.id || ""
    );
  }, [orgSlug]);

  useEffect(() => {
    const init = async () => {
      await loadBoard();
    };
    void init();
  }, [loadBoard]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/public/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug,
        queueId,
        customerName,
        customerContact,
        subject,
        priority,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Não foi possível gerar sua senha.");
    } else {
      setCreatedTicket(json.ticket);
      setCustomerName("");
      setCustomerContact("");
      setSubject("");
      await loadBoard();
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="border-b border-slate-800/80 px-5 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-cyan-300 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Início
            </Link>
            <span className="font-bold text-sm text-white">
              Totem de Check-in · {board?.organization.name || "..."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {board?.availableOrgs.map((o) => (
              <button
                key={o.slug}
                type="button"
                onClick={() => {
                  setCreatedTicket(null);
                  router.push(`/portal?org=${o.slug}`);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs border cursor-pointer ${
                  o.slug === orgSlug
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-800 bg-slate-900 text-slate-400"
                }`}
              >
                {o.name}
              </button>
            ))}
            <Link
              href={`/tv?org=${orgSlug}`}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300"
            >
              <MonitorPlay className="h-3.5 w-3.5" />
              Ver TV
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 grid gap-8 md:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-wider mb-2">
            <Ticket className="h-4 w-4" />
            Autoatendimento em Tempo Real
          </div>
          <h1 className="text-2xl font-bold text-white">Retirar Senha na Fila</h1>
          <p className="mt-1 text-xs text-slate-400">
            Sua senha entra imediatamente no banco PostgreSQL e aciona o Painel
            CCO e a TV via Server-Sent Events.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleCheckIn} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Serviço / Fila
              </label>
              <select
                value={queueId}
                onChange={(e) => setQueueId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"
              >
                {board?.queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} ({q.prefix})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Seu Nome ou Empresa
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: Fernanda Almeida"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Contato (opcional)
              </label>
              <input
                type="text"
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Motivo do Atendimento
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Despacho de nota fiscal prioritária"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Tipo de Atendimento
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "URGENT" | "HIGH" | "NORMAL")
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"
              >
                <option value="NORMAL">Atendimento Padrão</option>
                <option value="HIGH">Prioritário / Carga Expressa</option>
                <option value="URGENT">Emergência / SLA Crítico</option>
              </select>
            </div>

            <button
              type="submit"
              data-testid="portal-submit-ticket"
              disabled={submitting}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              {submitting ? "Gerando Senha..." : "Confirmar Check-in & Gerar Senha"}
            </button>
          </form>
        </section>

        <section className="space-y-5">
          {createdTicket ? (
            <div
              data-testid="portal-ticket-receipt"
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center"
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-300">
                Senha Emitida com Sucesso
              </span>
              <div className="mt-2 font-mono text-5xl font-black text-white">
                {createdTicket.ticketCode}
              </div>
              <p className="mt-3 text-xs text-slate-300">
                Prioridade:{" "}
                <strong className="text-white">{createdTicket.priority}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Prazo limite SLA:{" "}
                {new Date(createdTicket.slaDeadlineAt).toLocaleTimeString(
                  "pt-BR",
                  { hour: "2-digit", minute: "2-digit" }
                )}
              </p>
              <Link
                href={`/tv?org=${orgSlug}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Acompanhar no Painel TV →
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="font-bold text-sm text-white mb-2">
                Como funciona o Check-in Público?
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cada senha gerada aqui grava no PostgreSQL com cálculo automático
                de SLA, dispara evento em tempo real via SSE para operadores e TV
                e gera um job na fila Outbox para webhooks inscritos.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="font-mono text-xs uppercase tracking-wider text-cyan-400 mb-3">
              Fila Atual ({board?.waiting.length ?? 0} aguardando)
            </h3>
            <div className="flex flex-wrap gap-2">
              {board?.waiting.slice(0, 8).map((w) => (
                <span
                  key={w.id}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-xs font-bold text-slate-200"
                >
                  {w.ticketCode}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070b12] flex items-center justify-center text-slate-400 font-mono text-sm">
          Carregando totem de check-in...
        </div>
      }
    >
      <PortalInner />
    </Suspense>
  );
}
