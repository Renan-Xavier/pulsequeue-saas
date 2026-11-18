"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  DEMO_ACCOUNT_PRESETS,
  PUBLIC_DEMO_ACCESS_CODE,
} from "@/lib/demo-accounts";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("form");

    const res = await authClient.signIn.email({
      email: email.trim(),
      password,
    });

    if (res.error) {
      setError(res.error.message || "E-mail ou senha inválidos.");
      setLoading(null);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignUpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (orgName.trim().length < 2) {
      setError("Informe o nome da sua empresa ou equipe (mín. 2 caracteres).");
      return;
    }

    setLoading("form");

    const signUpRes = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: name.trim(),
    });

    if (signUpRes.error) {
      setError(signUpRes.error.message || "Não foi possível criar a conta.");
      setLoading(null);
      return;
    }

    const onboardRes = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationName: orgName.trim() }),
    });

    if (!onboardRes.ok) {
      const payload = await onboardRes.json().catch(() => ({}));
      setError(payload.error || "Conta criada, mas falhou ao provisionar workspace.");
      setLoading(null);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleDemoLogin(presetId: string, presetEmail: string) {
    setError(null);
    setLoading(presetId);

    const res = await authClient.signIn.email({
      email: presetEmail,
      password: PUBLIC_DEMO_ACCESS_CODE,
    });

    if (res.error) {
      setError(res.error.message || "Falha ao entrar na conta demo.");
      setLoading(null);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/80 px-5 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="font-bold text-sm text-white">PulseQueue</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] items-start">
        {/* Coluna Esquerda: Acesso Rápido Demo */}
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/60 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-cyan-300 font-mono text-xs uppercase tracking-wider mb-3">
            <Sparkles className="h-4 w-4" />
            Acesso Demo 1-Clique (Banco Neon Real)
          </div>
          <h1 className="text-2xl font-bold text-white">
            Teste Multi-Tenancy e RBAC na prática
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Escolha um perfil abaixo para entrar com sessão autenticada no
            PostgreSQL e validar permissões entre{" "}
            <strong className="text-emerald-300">ADMIN</strong>,{" "}
            <strong className="text-amber-300">OPERATOR</strong> e{" "}
            <strong className="text-cyan-300">2 organizações isoladas</strong>.
          </p>

          <div className="mt-6 space-y-3">
            {DEMO_ACCOUNT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`demo-login-${preset.id}`}
                disabled={loading !== null}
                onClick={() => handleDemoLogin(preset.id, preset.email)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-left hover:border-cyan-400/60 hover:bg-slate-900 transition-all cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-white">
                    {preset.label}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold border ${
                      preset.role === "ADMIN"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {preset.organization}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {preset.description}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-cyan-400">
                  <span>{preset.email}</span>
                  <span>
                    {loading === preset.id ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Entrando...
                      </span>
                    ) : (
                      "Entrar agora →"
                    )}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Coluna Direita: Login / Cadastro Custom */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:p-7">
          <div className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === "signin"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Entrar com E-mail
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === "signup"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Criar Novo Workspace
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {mode === "signin" ? (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  E-mail corporativo
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                {loading === "form" ? "Autenticando..." : "Entrar no Painel"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Seu nome completo
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Ana Paula Ferreira"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-cyan-400" />
                    Nome da Organização (Novo Tenant Isolado)
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ex: Logística Express RJ"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ana@logisticaexpress.com.br"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha (mín. 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                {loading === "form"
                  ? "Provisionando Workspace..."
                  : "Criar Conta + Workspace ADMIN"}
              </button>
            </form>
          )}

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Sessões protegidas por cookie HttpOnly assinado via Better Auth e
              persistência em PostgreSQL Neon.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
