import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  Lock,
  MonitorPlay,
  Radio,
  ShieldCheck,
  Ticket,
  Webhook,
} from "lucide-react";

const PILLARS = [
  {
    icon: Lock,
    title: "Multi-Tenancy & RBAC Real",
    description:
      "Sessões reais com Better Auth, proteção otimista no Proxy (Next.js 16) e isolamento estrito por organizationId com papéis ADMIN e OPERATOR.",
    accent: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  },
  {
    icon: Radio,
    title: "Tempo Real com SSE",
    description:
      "Stream Server-Sent Events nativo em Fluid Compute que sincroniza Dashboard CCO, Painel TV e Totem de Check-in instantaneamente entre abas.",
    accent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    icon: Webhook,
    title: "Webhooks HMAC & Idempotência",
    description:
      "Assinatura criptográfica HMAC-SHA256 com timingSafeEqual, prevenção contra replay e Idempotency-Key única no PostgreSQL.",
    accent: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
  {
    icon: Database,
    title: "Neon Postgres + Drizzle ORM",
    description:
      "Persistência real na nuvem com alocação atômica de senhas, cálculo de SLA por prioridade, tabela Outbox com retries e Audit Log imutável.",
    accent: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      {/* Topbar */}
      <header className="border-b border-slate-800/80 bg-[#070b12]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-400">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <span className="font-bold tracking-tight text-lg text-white">
                Pulse<span className="text-cyan-400">Queue</span>
              </span>
              <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                PRODUCTION SAAS
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/tv?org=techlog-brasil"
              className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
            >
              Painel TV Ao Vivo
            </Link>
            <Link
              href="/portal?org=techlog-brasil"
              className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
            >
              Totem Check-in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              Acessar Workspace (Demo 1-Clique)
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 font-mono text-xs text-cyan-300 mb-6">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            Full Stack TypeScript · Neon PostgreSQL · SSE Real-Time · HMAC Webhooks
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl leading-[1.08]">
            Orquestração de filas e SLA{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
              em tempo real
            </span>{" "}
            para operações B2B.
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed">
            SaaS Multi-Tenant completo rodando em nuvem com autenticação real,
            controle RBAC (<code className="font-mono text-cyan-300">ADMIN</code>{" "}
            / <code className="font-mono text-amber-300">OPERATOR</code>),
            sincronização instantânea entre Painel Operacional e TV via{" "}
            <strong className="text-white">Server-Sent Events</strong>, fila
            transacional <strong className="text-white">Outbox</strong> e ingestão
            de <strong className="text-white">Webhooks HMAC-SHA256</strong> com
            idempotência garantida no PostgreSQL.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 transition-colors"
            >
              Entrar com 1 Clique (Demo Admin / Operador)
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/tv?org=techlog-brasil"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-cyan-500/50 transition-colors"
            >
              <MonitorPlay className="h-4 w-4 text-cyan-400" />
              Abrir Painel TV Ao Vivo
            </Link>

            <Link
              href="/portal?org=techlog-brasil"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/50 transition-colors"
            >
              <Ticket className="h-4 w-4 text-emerald-400" />
              Tirar Senha (Totem Público)
            </Link>
          </div>
        </div>

        {/* Arquitetura Grid */}
        <section className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-2xl border border-slate-800/90 bg-slate-900/50 p-6 hover:border-cyan-500/40 transition-colors"
              >
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border mb-4 ${pillar.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="font-bold text-white text-base mb-2">
                  {pillar.title}
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </section>

        {/* Guia de Teste ao Vivo em 30s */}
        <section className="mt-16 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-cyan-400">
                Roteiro de Validação Técnica (Sem Mocks)
              </span>
              <h2 className="text-xl font-bold text-white mt-1">
                Teste os 4 fluxos críticos em produção em menos de 1 minuto
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              PostgreSQL Real + Drizzle ORM
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="font-mono text-xs font-bold text-cyan-400">
                01 · MULTI-TENANT & RBAC
              </span>
              <p className="mt-2 text-slate-300">
                Entre como <strong>ADMIN TechLog</strong>, depois troque para{" "}
                <strong>ADMIN NovaCare</strong> e confira os dados totalmente
                isolados por workspace.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="font-mono text-xs font-bold text-emerald-400">
                02 · STREAM SSE AO VIVO
              </span>
              <p className="mt-2 text-slate-300">
                Deixe o <strong>/tv</strong> aberto em uma aba e clique em{" "}
                <em>Chamar Próximo</em> no <strong>/dashboard</strong> — a TV
                atualiza na hora sem F5.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="font-mono text-xs font-bold text-amber-400">
                03 · HMAC & IDEMPOTÊNCIA
              </span>
              <p className="mt-2 text-slate-300">
                Em <strong>/webhooks</strong>, reenvie a mesma{" "}
                <code>Idempotency-Key</code> (200 deduplicated) ou adultere a
                assinatura para validar o bloqueio <code>401</code>.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="font-mono text-xs font-bold text-violet-400">
                04 · QUALIDADE & CI/CD
              </span>
              <p className="mt-2 text-slate-300">
                Testes unitários em Vitest, testes E2E reais com Playwright e
                pipeline GitHub Actions com PostgreSQL 16 em{" "}
                <code>.github/workflows/ci.yml</code>.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
