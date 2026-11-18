"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Key,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Webhook,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";

interface EndpointRow {
  id: string;
  name: string;
  url: string;
  events: string;
  isActive: boolean;
}

interface OutboxRow {
  id: string;
  eventType: string;
  idempotencyKey: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  direction: string;
  eventType: string;
  targetUrl: string;
  idempotencyKey: string;
  signatureHeader: string;
  httpStatus: number;
  status: string;
  responseSummary: string;
  createdAt: string;
}

interface WebhooksPayload {
  role: string;
  userEmail: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    ingestPath: string;
    webhookSecretPreview: string;
  };
  endpoints: EndpointRow[];
  outboxJobs: OutboxRow[];
  deliveries: DeliveryRow[];
}

export default function WebhooksPage() {
  const router = useRouter();
  const [data, setData] = useState<WebhooksPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulator state
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [customerName, setCustomerName] = useState("ERP Mercado Livre Integration");
  const [subject, setSubject] = useState(
    "Coleta urgente lote #9041 disparada via webhook"
  );
  const [simResult, setSimResult] = useState<{
    status: number;
    body: Record<string, unknown>;
  } | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  // Endpoint creation state
  const [epName, setEpName] = useState("");
  const [epUrl, setEpUrl] = useState("");

  const loadWebhooks = useCallback(async () => {
    const res = await fetch("/api/webhooks", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    const json: WebhooksPayload = await res.json();
    setData(json);
    setIdempotencyKey(
      (prev) => prev || `evt-${Math.random().toString(36).slice(2, 10)}`
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const init = async () => {
      await loadWebhooks();
    };
    void init();
  }, [loadWebhooks]);

  async function runWebhookSimulation(tamperSignature: boolean) {
    setError(null);
    setSimBusy(true);
    const res = await fetch("/api/webhooks/test-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey,
        customerName,
        subject,
        priority: "HIGH",
        tamperSignature,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSimResult({ status: res.status, body: json });
    await loadWebhooks();
    setSimBusy(false);
  }

  async function handleCreateEndpoint(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-endpoint",
        name: epName,
        url: epUrl,
        events: "*",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Somente ADMIN pode cadastrar endpoints.");
    } else {
      setEpName("");
      setEpUrl("");
      await loadWebhooks();
    }
  }

  async function handleRotateSecret() {
    setError(null);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate-secret" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Somente ADMIN pode rotacionar a chave.");
    } else {
      await loadWebhooks();
    }
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <AppNav
        organizationName={data?.organization.name}
        organizationSlug={data?.organization.slug}
        userEmail={data?.userEmail}
        role={data?.role}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-300 font-mono text-xs uppercase tracking-wider">
              <Webhook className="h-4 w-4" />
              Engine Transacional Outbox &amp; Ingestão Segura HMAC-SHA256
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Webhooks Assinados &amp; Idempotência
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Endpoint de ingestão:{" "}
              <code className="font-mono text-cyan-300">
                POST {data?.organization.ingestPath || "..."}
              </code>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-slate-400 inline-flex items-center gap-1">
                <Key className="h-3.5 w-3.5 text-amber-400" />
                HMAC Secret ({data?.role}):
              </span>
              <button
                type="button"
                onClick={handleRotateSecret}
                className="text-cyan-400 hover:text-cyan-300 font-mono text-[11px] cursor-pointer"
              >
                Rotacionar (ADMIN)
              </button>
            </div>
            <code className="block font-mono text-emerald-300 break-all">
              {loading ? "..." : data?.organization.webhookSecretPreview}
            </code>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Laboratório Interativo HMAC + Idempotência */}
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Laboratório Ao Vivo: Teste HMAC-SHA256 &amp; Idempotency-Key
              </h2>
              <button
                type="button"
                onClick={() =>
                  setIdempotencyKey(
                    `evt-${Math.random().toString(36).slice(2, 10)}`
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-cyan-300 hover:border-cyan-500 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Nova Chave
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Header Idempotency-Key
                </label>
                <input
                  type="text"
                  data-testid="webhook-idempotency-input"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Origem / Cliente do Evento
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Assunto do Ticket Recebido
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                data-testid="webhook-send-valid"
                disabled={simBusy}
                onClick={() => runWebhookSimulation(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                Enviar Assinado (Testar 201 / Idempotência 200)
              </button>

              <button
                type="button"
                data-testid="webhook-send-tampered"
                disabled={simBusy}
                onClick={() => runWebhookSimulation(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500 hover:text-white cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Adulterar Assinatura HMAC (Testar Bloqueio 401)
              </button>
            </div>

            {simResult && (
              <div
                data-testid="webhook-sim-result"
                className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">Resposta HTTP:</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold ${
                      simResult.status === 201
                        ? "bg-emerald-500/20 text-emerald-300"
                        : simResult.status === 200
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    HTTP {simResult.status}
                  </span>
                </div>
                <pre className="overflow-x-auto text-[11px] text-slate-300">
                  {JSON.stringify(simResult.body, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Cadastro de Endpoints Outbound */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-400" />
              Endpoints de Saída (Outbox)
            </h2>

            <form onSubmit={handleCreateEndpoint} className="space-y-3">
              <input
                type="text"
                required
                value={epName}
                onChange={(e) => setEpName(e.target.value)}
                placeholder="Nome (ex:ERP Financeiro)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                required
                value={epUrl}
                onChange={(e) => setEpUrl(e.target.value)}
                placeholder="https://webhook.site/... ou internal://audit-sink"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 cursor-pointer"
              >
                Cadastrar Endpoint (ADMIN)
              </button>
            </form>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              {data?.endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{ep.name}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> ATIVO
                    </span>
                  </div>
                  <code className="block font-mono text-[11px] text-cyan-300 mt-1 truncate">
                    {ep.url}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Logs de Entregas e Fila Outbox */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-3">
              Histórico de Entregas &amp; Ingestões (HMAC / Idempotência)
            </h2>
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {data?.deliveries.map((del) => (
                <div
                  key={del.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-cyan-300">
                      [{del.direction}] {del.eventType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        del.httpStatus >= 200 && del.httpStatus < 300
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      HTTP {del.httpStatus} · {del.status}
                    </span>
                  </div>
                  <p className="text-slate-300">{del.responseSummary}</p>
                  <p className="font-mono text-[10px] text-slate-500 truncate">
                    Key: {del.idempotencyKey}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-3">
              Fila Transacional Outbox (Retries / Dead Letter)
            </h2>
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {data?.outboxJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-white">
                      {job.eventType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        job.status === "DELIVERED"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : job.status === "DEAD_LETTER"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {job.status} ({job.attempts}/{job.maxAttempts})
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-500 truncate">
                    {job.idempotencyKey}
                  </p>
                  {job.lastError && (
                    <p className="text-rose-300 text-[11px]">{job.lastError}</p>
                  )}
                </div>
              ))}
              {data?.outboxJobs.length === 0 && (
                <p className="text-xs text-slate-500">
                  Nenhum job na fila Outbox ainda — abra ou chame uma senha no
                  Painel CCO para disparar eventos automaticamente.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
