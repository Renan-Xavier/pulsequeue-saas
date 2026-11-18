"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderPlus,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";

interface QueueRow {
  id: string;
  name: string;
  prefix: string;
  description: string;
  nextSequence: number;
}

interface TicketRow {
  id: string;
  queueId: string;
  queueName: string;
  ticketCode: string;
  customerName: string;
  customerContact: string;
  subject: string;
  priority: "URGENT" | "HIGH" | "NORMAL";
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  deskLabel: string | null;
  slaHealth: "HEALTHY" | "WARNING" | "BREACHED";
  slaDeadlineAt: string;
  createdAt: string;
}

interface DashboardPayload {
  session: {
    user: { id: string; name: string; email: string };
    organization: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      slaTargetMinutes: number;
    };
    role: string;
  };
  queues: QueueRow[];
  waiting: TicketRow[];
  inProgress: TicketRow[];
  completed: TicketRow[];
  stats: {
    waitingCount: number;
    inProgressCount: number;
    completedCount: number;
    breachedCount: number;
  };
}

const PRIORITY_BADGES: Record<string, string> = {
  URGENT: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  HIGH: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  NORMAL: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
};

const SLA_BADGES: Record<string, string> = {
  BREACHED: "border-rose-500/50 bg-rose-500/20 text-rose-200",
  WARNING: "border-amber-500/50 bg-amber-500/20 text-amber-200",
  HEALTHY: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastRealtimeNotice, setLastRealtimeNotice] = useState<string | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Forms state
  const [deskLabel, setDeskLabel] = useState("Guichê 01");
  const [selectedQueueFilter, setSelectedQueueFilter] = useState<string>("");
  const [newTicketQueueId, setNewTicketQueueId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "HIGH" | "NORMAL">(
    "HIGH"
  );

  // Admin-only create queue form
  const [queueName, setQueueName] = useState("");
  const [queuePrefix, setQueuePrefix] = useState("");

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/tickets", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    const json: DashboardPayload = await res.json();
    setData(json);
    setNewTicketQueueId((prev) => prev || json.queues[0]?.id || "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      await loadDashboard();
    };
    void init();

    const evtSource = new EventSource("/api/realtime/stream");
    evtSource.onopen = () => {
      if (active) setSseConnected(true);
    };
    evtSource.onmessage = (msg) => {
      if (!active) return;
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === "connected") {
          setSseConnected(true);
          return;
        }
        if (parsed.type === "ping") return;
        setLastRealtimeNotice(parsed.summary || "Fila sincronizada");
        void loadDashboard();
      } catch {
        // Ignore keepalive chunks
      }
    };
    evtSource.onerror = () => {
      if (active) setSseConnected(false);
    };

    return () => {
      active = false;
      evtSource.close();
    };
  }, [loadDashboard]);

  async function handleCallNext() {
    setActionError(null);
    setActionBusy("call-next");
    const res = await fetch("/api/tickets/call-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: selectedQueueFilter || undefined,
        deskLabel,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(json.error || "Não foi possível chamar o próximo.");
    } else {
      await loadDashboard();
    }
    setActionBusy(null);
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionBusy("create-ticket");

    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: newTicketQueueId || data?.queues[0]?.id,
        customerName,
        subject,
        priority,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(json.error || "Erro ao criar senha.");
    } else {
      setCustomerName("");
      setSubject("");
      await loadDashboard();
    }
    setActionBusy(null);
  }

  async function handleTransition(
    ticketId: string,
    nextStatus: "IN_PROGRESS" | "COMPLETED" | "WAITING" | "CANCELLED"
  ) {
    setActionError(null);
    setActionBusy(ticketId);

    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nextStatus,
        deskLabel: nextStatus === "IN_PROGRESS" ? deskLabel : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(json.error || "Erro ao atualizar status.");
    } else {
      await loadDashboard();
    }
    setActionBusy(null);
  }

  async function handleCreateQueue(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionBusy("create-queue");

    const res = await fetch("/api/queues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: queueName, prefix: queuePrefix }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(json.error || "Sem permissão ou dados inválidos.");
    } else {
      setQueueName("");
      setQueuePrefix("");
      await loadDashboard();
    }
    setActionBusy(null);
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <AppNav
        organizationName={data?.session.organization.name}
        organizationSlug={data?.session.organization.slug}
        userEmail={data?.session.user.email}
        role={data?.session.role}
        sseConnected={sseConnected}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Topo com Chamada Rápida + Realtime Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Central de Controle Operacional (CCO)
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Operador:{" "}
              <span className="text-slate-200 font-medium">
                {data?.session.user.name || "..."}
              </span>{" "}
              · SLA Base da Organização:{" "}
              <span className="font-mono text-cyan-300">
                {data?.session.organization.slaTargetMinutes ?? 15} min
              </span>
              {lastRealtimeNotice && (
                <span className="ml-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300">
                  SSE: {lastRealtimeNotice}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Selecionar Guichê"
              value={deskLabel}
              onChange={(e) => setDeskLabel(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="Guichê 01">Guichê 01</option>
              <option value="Guichê 02">Guichê 02</option>
              <option value="Doca VIP 03">Doca VIP 03</option>
              <option value="Mesa N2-A">Mesa N2-A</option>
            </select>

            <button
              type="button"
              data-testid="call-next-button"
              disabled={actionBusy !== null || loading}
              onClick={handleCallNext}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs sm:text-sm font-bold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Megaphone className="h-4 w-4" />
              {actionBusy === "call-next"
                ? "Chamando..."
                : "Chamar Próximo da Fila"}
            </button>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 hover:border-slate-500 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {actionError && (
          <div
            data-testid="dashboard-error"
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-200 flex items-center justify-between"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <span className="text-xs font-mono text-slate-400">
              AGUARDANDO NA FILA
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                data-testid="kpi-waiting"
                className="text-3xl font-bold text-white"
              >
                {data?.stats.waitingCount ?? 0}
              </span>
              <Users className="h-5 w-5 text-cyan-400" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <span className="text-xs font-mono text-slate-400">
              EM ATENDIMENTO
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                data-testid="kpi-in-progress"
                className="text-3xl font-bold text-emerald-400"
              >
                {data?.stats.inProgressCount ?? 0}
              </span>
              <Play className="h-5 w-5 text-emerald-400" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <span className="text-xs font-mono text-slate-400">
              CONCLUÍDOS HOJE
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-100">
                {data?.stats.completedCount ?? 0}
              </span>
              <CheckCircle2 className="h-5 w-5 text-cyan-400" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <span className="text-xs font-mono text-slate-400">
              SLA ESTOURADO
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-rose-400">
                {data?.stats.breachedCount ?? 0}
              </span>
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            </div>
          </div>
        </div>

        {/* Grid Principal: Operação + Formulários */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          {/* Coluna Esquerda: Em Atendimento + Fila de Espera */}
          <div className="space-y-6">
            {/* Em Atendimento Agora */}
            <section className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300 mb-4 flex items-center gap-2">
                <Play className="h-4 w-4" />
                Em Atendimento Agora
              </h2>

              {loading ? (
                <p className="text-sm text-slate-400">Carregando atendimentos...</p>
              ) : data?.inProgress.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nenhum chamado ativo. Clique em{" "}
                  <strong>Chamar Próximo da Fila</strong>.
                </p>
              ) : (
                <div className="space-y-3">
                  {data?.inProgress.map((t) => (
                    <div
                      key={t.id}
                      data-testid={`in-progress-${t.ticketCode}`}
                      className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-lg font-black text-emerald-300">
                            {t.ticketCode}
                          </span>
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                            {t.deskLabel || "Guichê 01"}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                              PRIORITY_BADGES[t.priority]
                            }`}
                          >
                            {t.priority}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white mt-1">
                          {t.customerName}
                        </p>
                        <p className="text-xs text-slate-400">{t.subject}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionBusy === t.id}
                          onClick={() => handleTransition(t.id, "COMPLETED")}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Concluir
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy === t.id}
                          onClick={() => handleTransition(t.id, "WAITING")}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-200 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Devolver
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Aguardando na Fila */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Aguardando na Fila (Ordenado por Prioridade & SLA)
                </h2>

                <select
                  aria-label="Filtrar fila"
                  value={selectedQueueFilter}
                  onChange={(e) => setSelectedQueueFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="">Todas as Filas</option>
                  {data?.queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name} ({q.prefix})
                    </option>
                  ))}
                </select>
              </div>

              {loading ? (
                <p className="text-sm text-slate-400">Carregando fila...</p>
              ) : (
                <div className="space-y-2.5">
                  {data?.waiting
                    .filter(
                      (t) =>
                        !selectedQueueFilter ||
                        t.queueId === selectedQueueFilter
                    )
                    .map((t) => (
                      <div
                        key={t.id}
                        data-testid={`waiting-${t.ticketCode}`}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 flex flex-wrap items-center justify-between gap-3 hover:border-cyan-500/30 transition-colors"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">
                              {t.ticketCode}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                                PRIORITY_BADGES[t.priority]
                              }`}
                            >
                              {t.priority}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                SLA_BADGES[t.slaHealth]
                              }`}
                            >
                              SLA: {t.slaHealth}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {t.queueName}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-200 mt-1">
                            {t.customerName}
                          </p>
                          <p className="text-xs text-slate-400">{t.subject}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionBusy === t.id}
                            onClick={() =>
                              handleTransition(t.id, "IN_PROGRESS")
                            }
                            className="rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 transition-colors cursor-pointer"
                          >
                            Chamar
                          </button>
                          <button
                            type="button"
                            title="Cancelar chamado"
                            disabled={actionBusy === t.id}
                            onClick={() => handleTransition(t.id, "CANCELLED")}
                            className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 cursor-pointer"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  {data?.waiting.length === 0 && (
                    <p className="text-sm text-slate-400">
                      Fila vazia neste momento.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Coluna Direita: Novo Chamado + Nova Fila (RBAC ADMIN) + Histórico */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyan-400" />
                Abrir Nova Senha / Chamado
              </h2>

              <form onSubmit={handleCreateTicket} className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Fila Operacional
                  </label>
                  <select
                    value={newTicketQueueId}
                    onChange={(e) => setNewTicketQueueId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {data?.queues.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name} ({q.prefix})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Cliente / Transportadora
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex: Rápido Paulista Ltda"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Assunto / Motivo
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Atraso na doca 04 - carga prioritária"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Prioridade SLA
                  </label>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(
                        e.target.value as "URGENT" | "HIGH" | "NORMAL"
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="URGENT">URGENT (35% do SLA)</option>
                    <option value="HIGH">HIGH (65% do SLA)</option>
                    <option value="NORMAL">NORMAL (100% do SLA)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  data-testid="create-ticket-submit"
                  disabled={actionBusy === "create-ticket"}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
                >
                  {actionBusy === "create-ticket"
                    ? "Emitindo Senha..."
                    : "Emitir Senha na Fila"}
                </button>
              </form>
            </section>

            {/* Criar Nova Fila (Prova RBAC: ADMIN cria / OPERATOR recebe 403) */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <FolderPlus className="h-4 w-4 text-emerald-400" />
                  Nova Fila (RBAC ADMIN)
                </h2>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  Papel atual: {data?.session.role || "..."}
                </span>
              </div>

              <form onSubmit={handleCreateQueue} className="space-y-3">
                <div className="grid grid-cols-[1fr_84px] gap-2">
                  <input
                    type="text"
                    required
                    value={queueName}
                    onChange={(e) => setQueueName(e.target.value)}
                    placeholder="Ex: Triagem Express"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600"
                  />
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={queuePrefix}
                    onChange={(e) => setQueuePrefix(e.target.value.toUpperCase())}
                    placeholder="EX"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs uppercase text-white placeholder:text-slate-600"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="create-queue-submit"
                  disabled={actionBusy === "create-queue"}
                  className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  Criar Fila (Testa permissão ADMIN na API)
                </button>
              </form>
            </section>

            {/* Histórico recente */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Últimos Encerramentos
              </h2>
              <div className="space-y-2">
                {data?.completed.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs border-b border-slate-800/70 pb-2 last:border-0"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-200 mr-2">
                        {t.ticketCode}
                      </span>
                      <span className="text-slate-400">{t.customerName}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
