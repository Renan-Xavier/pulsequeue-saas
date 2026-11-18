"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, MonitorPlay, Radio, Volume2 } from "lucide-react";

interface PublicTicket {
  id: string;
  ticketCode: string;
  displayCustomer: string;
  queueName: string;
  priority: string;
  status?: string;
  deskLabel?: string | null;
  slaHealth: string;
}

interface BoardData {
  organization: { id: string; name: string; slug: string; slaTargetMinutes: number };
  availableOrgs: Array<{ name: string; slug: string }>;
  inProgress: PublicTicket[];
  waiting: PublicTicket[];
  recentCompleted: PublicTicket[];
}

function TvBoardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org") || "techlog-brasil";

  const [board, setBoard] = useState<BoardData | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastPulse, setLastPulse] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    const res = await fetch(
      `/api/public/board?org=${encodeURIComponent(orgSlug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const json: BoardData = await res.json();
    setBoard(json);
  }, [orgSlug]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      await fetchBoard();
    };
    void init();

    const stream = new EventSource(
      `/api/realtime/stream?org=${encodeURIComponent(orgSlug)}`
    );
    stream.onopen = () => {
      if (active) setSseConnected(true);
    };
    stream.onmessage = (msg) => {
      if (!active) return;
      try {
        const event = JSON.parse(msg.data);
        if (event.type === "connected") {
          setSseConnected(true);
          return;
        }
        if (event.type === "ping") return;
        setLastPulse(event.summary || "Chamado atualizado");
        void fetchBoard();
      } catch {
        // Ignore keepalive chunks
      }
    };
    stream.onerror = () => {
      if (active) setSseConnected(false);
    };

    return () => {
      active = false;
      stream.close();
    };
  }, [fetchBoard, orgSlug]);

  const currentCall = board?.inProgress[0] ?? null;

  return (
    <div className="min-h-screen bg-[#05080f] text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/90 bg-[#070b12]/95 px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-cyan-300 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              CCO
            </Link>
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-cyan-400" />
              <span className="font-bold text-lg text-white">
                {board?.organization.name || "Carregando Painel..."}
              </span>
            </div>
            <span
              data-testid="tv-sse-badge"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs ${
                sseConnected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {sseConnected ? "LIVE SSE" : "Reconectando..."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Alternar Tenant TV:</span>
            {board?.availableOrgs.map((o) => (
              <button
                key={o.slug}
                type="button"
                onClick={() => router.push(`/tv?org=${o.slug}`)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors ${
                  o.slug === orgSlug
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-6 lg:grid-cols-[1.35fr_0.95fr]">
        {/* Chamada em Destaque Gigante */}
        <section className="flex flex-col justify-between rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-[#081220] to-slate-950 p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">
              <Volume2 className="h-4 w-4 animate-pulse" />
              Senha Chamada Agora
            </span>
            {lastPulse && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 font-mono text-[11px] text-emerald-300">
                {lastPulse}
              </span>
            )}
          </div>

          {currentCall ? (
            <div className="my-auto py-8">
              <div
                data-testid="tv-current-ticket"
                className="font-mono text-7xl sm:text-8xl font-black tracking-tight text-white"
              >
                {currentCall.ticketCode}
              </div>
              <div className="mt-4 inline-flex items-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-xl sm:text-2xl font-bold text-emerald-300">
                Dirigir-se ao {currentCall.deskLabel || "Guichê 01"}
              </div>
              <p className="mt-5 text-2xl font-semibold text-slate-200">
                {currentCall.displayCustomer}
              </p>
              <p className="mt-1 text-sm font-mono text-cyan-300">
                {currentCall.queueName} · PRIORIDADE {currentCall.priority}
              </p>
            </div>
          ) : (
            <div className="my-auto py-12 text-center">
              <Activity className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-xl font-semibold text-slate-300">
                Nenhuma senha em atendimento neste momento
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Aguardando chamada pelo Painel CCO...
              </p>
            </div>
          )}

          {board && board.inProgress.length > 1 && (
            <div className="border-t border-slate-800 pt-4">
              <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400 block mb-2">
                Outros Guichês Atendendo Agora
              </span>
              <div className="flex flex-wrap gap-3">
                {board.inProgress.slice(1).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2 text-xs"
                  >
                    <span className="font-mono font-bold text-emerald-300 mr-2">
                      {item.ticketCode}
                    </span>
                    <span className="text-slate-300">{item.deskLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Próximos da Fila + Recentes */}
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-400 mb-4">
              Próximos na Fila ({board?.waiting.length ?? 0})
            </h2>
            <div className="space-y-2.5">
              {board?.waiting.slice(0, 7).map((item, index) => (
                <div
                  key={item.id}
                  data-testid={`tv-waiting-${item.ticketCode}`}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-500">
                      #{index + 1}
                    </span>
                    <span className="font-mono text-lg font-bold text-white">
                      {item.ticketCode}
                    </span>
                    <span className="text-sm text-slate-300">
                      {item.displayCustomer}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold border ${
                      item.priority === "URGENT"
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : item.priority === "HIGH"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
              ))}
              {board?.waiting.length === 0 && (
                <p className="text-sm text-slate-500">Fila vazia.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">
              Atendimentos Finalizados
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {board?.recentCompleted.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs flex items-center justify-between"
                >
                  <span className="font-mono font-bold text-slate-300">
                    {item.ticketCode}
                  </span>
                  <span className="text-slate-500 truncate max-w-[110px]">
                    {item.displayCustomer}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function TvBoardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#05080f] flex items-center justify-center text-slate-400 font-mono text-sm">
          Conectando Painel TV em tempo real...
        </div>
      }
    >
      <TvBoardInner />
    </Suspense>
  );
}
