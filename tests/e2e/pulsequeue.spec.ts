import { expect, test } from "@playwright/test";

test.describe("PulseQueue E2E — Multi-Tenant, RBAC, SSE & HMAC Webhooks", () => {
  test("login demo, create & call ticket with live SSE sync on /tv", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/login");
    await page.getByTestId("demo-login-techlog-admin").click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByTestId("sse-status")).toContainText("SSE Tempo Real", {
      timeout: 15_000,
    });

    // Abre segunda aba no Painel TV público antes de emitir nova senha
    const tvPage = await context.newPage();
    await tvPage.goto("/tv?org=techlog-brasil");
    await expect(tvPage.getByTestId("tv-sse-badge")).toContainText("LIVE SSE", {
      timeout: 15_000,
    });

    const uniqueCustomer = `Cliente E2E ${Date.now().toString().slice(-4)}`;
    await page.getByPlaceholder("Ex: Rápido Paulista Ltda").fill(uniqueCustomer);
    await page
      .getByPlaceholder("Ex: Atraso na doca 04 - carga prioritária")
      .fill("Teste E2E sincronizacao SSE em tempo real");
    await page.getByTestId("create-ticket-submit").click();

    // Confirma criação no dashboard
    await expect(page.getByText(uniqueCustomer)).toBeVisible({ timeout: 10_000 });

    // Verifica que a TV recebeu atualização SSE sem recarregar
    const shortName = `${uniqueCustomer.split(" ")[0]} `;
    await expect(tvPage.getByText(shortName).first()).toBeVisible({
      timeout: 12_000,
    });

    // Chama próximo ticket (URGENT criado/topo) no CCO e confirma TV atualizar
    await page.getByTestId("call-next-button").click();
    await expect(tvPage.getByTestId("tv-current-ticket")).toBeVisible({
      timeout: 10_000,
    });

    await context.close();
  });

  test("enforces RBAC blocking OPERATOR from creating queues", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId("demo-login-techlog-operator").click();
    await page.waitForURL("**/dashboard");

    await page.getByPlaceholder("Ex: Triagem Express").fill("Fila Bloqueada");
    await page.getByPlaceholder("EX", { exact: true }).fill("BLQ");
    await page.getByTestId("create-queue-submit").click();

    await expect(page.getByTestId("dashboard-error")).toContainText("RBAC", {
      timeout: 10_000,
    });
  });

  test("validates HMAC-SHA256 webhooks, idempotency deduplication, and 401 tamper protection", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId("demo-login-techlog-admin").click();
    await page.waitForURL("**/dashboard");

    await page.goto("/webhooks");
    const uniqueKey = `e2e-idem-${Date.now()}`;
    await page.getByTestId("webhook-idempotency-input").fill(uniqueKey);

    // 1. Primeira requisição válida -> 201 Created
    await page.getByTestId("webhook-send-valid").click();
    await expect(page.getByTestId("webhook-sim-result")).toContainText(
      "HTTP 201",
      { timeout: 10_000 }
    );
    await expect(page.getByTestId("webhook-sim-result")).toContainText(
      '"deduplicated": false'
    );

    // 2. Reenvio com mesma Idempotency-Key -> 200 OK deduplicated
    await page.getByTestId("webhook-send-valid").click();
    await expect(page.getByTestId("webhook-sim-result")).toContainText(
      "HTTP 200",
      { timeout: 10_000 }
    );
    await expect(page.getByTestId("webhook-sim-result")).toContainText(
      '"deduplicated": true'
    );

    // 3. Assinatura adulterada -> 401 Rejected
    await page.getByTestId("webhook-send-tampered").click();
    await expect(page.getByTestId("webhook-sim-result")).toContainText(
      "HTTP 401",
      { timeout: 10_000 }
    );
  });
});
