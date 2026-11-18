export interface DemoAccountPreset {
  id: string;
  label: string;
  email: string;
  organization: string;
  orgSlug: string;
  role: "ADMIN" | "OPERATOR";
  description: string;
}

export const DEMO_ACCOUNT_PRESETS: readonly DemoAccountPreset[] = [
  {
    id: "techlog-admin",
    label: "Renan Xavier · ADMIN",
    email: "admin@pulsequeue.dev",
    organization: "TechLog Brasil",
    orgSlug: "techlog-brasil",
    role: "ADMIN",
    description:
      "Acesso total: cria filas, chama senhas, gerencia webhooks e rotaciona segredo HMAC.",
  },
  {
    id: "techlog-operator",
    label: "Camila Torres · OPERATOR",
    email: "operador@pulsequeue.dev",
    organization: "TechLog Brasil",
    orgSlug: "techlog-brasil",
    role: "OPERATOR",
    description:
      "Operação diária: chama/conclui senhas (bloqueado em ações exclusivas de ADMIN).",
  },
  {
    id: "novacare-admin",
    label: "Marcelo Lima · ADMIN (Tenant 2)",
    email: "gestor@novacare.dev",
    organization: "NovaCare Saúde",
    orgSlug: "novacare-saude",
    role: "ADMIN",
    description:
      "Segundo workspace isolado para validar Multi-Tenancy no PostgreSQL.",
  },
];

export const PUBLIC_DEMO_ACCESS_CODE = ["PulseQueue", "@2026"].join("");
