import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLoopbackUrl(value, label) {
  const url = new URL(value);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `${label} must be loopback-only for the local pilot.`);
}

async function waitForPerson(client, email) {
  for (let i = 0; i < 40; i += 1) {
    const { data, error } = await client.from("person").select("id, email").ilike("email", email).maybeSingle();
    if (error) throw error;
    if (data) return data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for local fixture ${email}.`);
}

async function authUserByEmail(client, email) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (result.error) throw result.error;
    const match = result.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (result.data.users.length < 200) return null;
  }
  return null;
}

async function cleanupPilotFixtures(customer, customerDbUrl) {
  const { data: staleClients, error: staleClientsError } = await customer
    .from("clients")
    .select("id, person_id, submit_date, date")
    .ilike("client_name", "Local Pilot Client %");
  if (staleClientsError) throw staleClientsError;

  const trackerCandidates = (staleClients ?? [])
    .map((client) => ({ personId: client.person_id, date: client.submit_date || client.date }))
    .filter((row) => row.personId && row.date);
  const staleClientIds = (staleClients ?? []).map((client) => client.id);
  if (staleClientIds.length) {
    const deletedClients = await customer.from("clients").delete().in("id", staleClientIds);
    if (deletedClients.error) throw deletedClients.error;
  }

  const { data: stalePeople, error: stalePeopleError } = await customer
    .from("person")
    .select("id, email")
    .ilike("email", "pilot-%@example.test");
  if (stalePeopleError) throw stalePeopleError;

  const stalePersonIds = (stalePeople ?? []).map((person) => person.id);
  if (stalePersonIds.length) {
    const db = new PgClient({ connectionString: customerDbUrl });
    await db.connect();
    try {
      await db.query("begin");
      await db.query("set local session_replication_role = replica");
      await db.query(
        "delete from public.person_role_status_history where person_id = any($1::uuid[]) or upline_id = any($1::uuid[])",
        [stalePersonIds],
      );
      await db.query("commit");
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    } finally {
      await db.end();
    }
  }

  for (const person of stalePeople ?? []) {
    const recruitDelete = await customer.from("recruit").delete().eq("person_id", person.id);
    if (recruitDelete.error) throw recruitDelete.error;
    const personDelete = await customer.from("person").delete().eq("id", person.id);
    if (personDelete.error) throw personDelete.error;
    const authUser = await authUserByEmail(customer, person.email);
    if (authUser) {
      const authDelete = await customer.auth.admin.deleteUser(authUser.id);
      if (authDelete.error) throw authDelete.error;
    }
  }

  for (const candidate of trackerCandidates) {
    const { data: tracker, error: trackerError } = await customer
      .from("tracker_entry")
      .select("id, dials, contacts, appointments, presentations, sales, leads")
      .eq("person_id", candidate.personId)
      .eq("entry_date", candidate.date)
      .maybeSingle();
    if (trackerError) throw trackerError;
    if (tracker && [tracker.dials, tracker.contacts, tracker.appointments, tracker.presentations, tracker.sales, tracker.leads].every((value) => Number(value ?? 0) === 0)) {
      const trackerDelete = await customer.from("tracker_entry").delete().eq("id", tracker.id);
      if (trackerDelete.error) throw trackerDelete.error;
    }
  }

  const [peopleCheck, clientsCheck] = await Promise.all([
    customer.from("person").select("id", { count: "exact", head: true }).ilike("email", "pilot-%@example.test"),
    customer.from("clients").select("id", { count: "exact", head: true }).ilike("client_name", "Local Pilot Client %"),
  ]);
  if (peopleCheck.error) throw peopleCheck.error;
  if (clientsCheck.error) throw clientsCheck.error;
  assert((peopleCheck.count ?? 0) === 0 && (clientsCheck.count ?? 0) === 0, "Local verification fixture cleanup was incomplete.");
  return { removedPeople: (stalePeople ?? []).length, removedClients: staleClientIds.length };
}

async function clearHeadshotWallThroughUi(page) {
  const heading = page.getByRole("heading", { name: "Add your headshot to continue" });
  if (!(await heading.isVisible().catch(() => false))) return false;

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "local-pilot-headshot.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit photo for review" }).click();
  await heading.waitFor({ state: "hidden" });
  return true;
}

async function clearNpnRequestThroughUi(page) {
  const dialog = page.getByRole("dialog", { name: "NPN request" });
  if (!(await dialog.isVisible().catch(() => false))) return false;
  await dialog.getByRole("button", { name: "I do not have an NPN yet" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.waitFor({ state: "hidden" });
  return true;
}

async function clearGatewayPromptThroughUi(page) {
  const dialog = page.getByRole("dialog", { name: /(?:Connect|Reconnect) your personal Gateway/i });
  if (!(await dialog.isVisible().catch(() => false))) return false;
  await dialog.getByRole("button", { name: "I’ll do it later" }).click();
  await dialog.waitFor({ state: "hidden" });
  return true;
}

async function main() {
  const target = (process.argv[2] ?? "a").toLowerCase();
  if (target !== "a") throw new Error("Manual verification is currently pinned to local Customer A only.");
  if (process.env.WHITELABEL_LOCAL_PILOT !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("This runner is local-pilot only.");
  }

  const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
  const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const controlProjectRef = process.env.WHITELABEL_LOCAL_CONTROL_PROJECT_REF || "local-control";
  const controlProject = registry.projects.find((row) => row.projectRef === controlProjectRef);
  assert(controlProject, `Local control-plane registry entry ${controlProjectRef} is required.`);
  assert(controlProject.role === "control-plane-local", `${controlProjectRef} is not classified as the local control plane.`);
  assertLoopbackUrl(controlProject.apiUrl, "Control-plane apiUrl");
  assertLoopbackUrl(controlProject.dbUrl, "Control-plane dbUrl");
  const controlUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || controlProject.apiUrl;
  const controlKey = process.env.SUPABASE_SERVICE_ROLE_KEY || controlProject.secretKey;
  if (!controlUrl || !controlKey) throw new Error("Local control-plane env is incomplete.");
  assert(
    controlUrl.replace(/\/+$/, "") === controlProject.apiUrl.replace(/\/+$/, ""),
    "Refusing manual verification: current Supabase URL is not the registered local-control project.",
  );
  const targetProjectRef = process.env.WHITELABEL_LOCAL_TARGET_PROJECT_REF || "local-customer-a";
  const isolationProjectRef = process.env.WHITELABEL_LOCAL_ISOLATION_PROJECT_REF
    || (targetProjectRef === "local-customer-a" ? "local-customer-b" : "local-customer-a");
  const customerA = registry.projects.find((row) => row.projectRef === targetProjectRef);
  const customerB = registry.projects.find((row) => row.projectRef === isolationProjectRef);
  assert(customerA && customerB, "Local Customer A/B registry entries are required.");
  assert(customerA.role === "customer-local" && customerB.role === "customer-local", "Local Customer A/B must be classified as customer-local.");
  for (const customerProject of [customerA, customerB]) {
    assertLoopbackUrl(customerProject.apiUrl, `${customerProject.projectRef} apiUrl`);
    assertLoopbackUrl(customerProject.dbUrl, `${customerProject.projectRef} dbUrl`);
  }
  const deployment = JSON.parse(readFileSync(path.join(root, "deployments", `${targetProjectRef}.json`), "utf8"));
  const base = customerA.runtimeAppUrl.replace(/\/+$/, "");
  const browserBaseUrl = new URL(base);
  browserBaseUrl.hostname = "localhost";
  const browserBase = browserBaseUrl.origin;

  const control = createClient(controlUrl, controlKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const customer = createClient(customerA.apiUrl, customerA.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const customerAnon = createClient(customerA.apiUrl, customerA.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (process.argv.includes("--cleanup-only")) {
    const cleanup = await cleanupPilotFixtures(customer, customerA.dbUrl);
    process.stdout.write(JSON.stringify({ cleanupOnly: true, ...cleanup }) + "\n");
    return;
  }
  await cleanupPilotFixtures(customer, customerA.dbUrl);

  const [{ data: build, error: buildError }, { data: actor, error: actorError }] = await Promise.all([
    control
      .from("whitelabel_build")
      .select("id, product_name, initial_admin_email, email_from, reply_to_email, support_email")
      .eq("domain", "customer-a.local")
      .single(),
    control.from("person").select("id").eq("email", "admin@allstar.test").single(),
  ]);
  if (buildError || !build) throw buildError ?? new Error("Pilot A build is missing.");
  if (actorError || !actor) throw actorError ?? new Error("Local verification actor is missing.");

  const { data: verificationRun, error: runError } = await control
    .from("whitelabel_verification_run")
    .select("id, status")
    .eq("build_id", build.id)
    .eq("kind", "handoff")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (runError || !verificationRun) throw runError ?? new Error("Start local handoff verification first.");
  const { data: verificationItems, error: itemsError } = await control
    .from("whitelabel_verification_item")
    .select("id, check_key, mode, required_for_handoff, status")
    .eq("run_id", verificationRun.id);
  if (itemsError) throw itemsError;
  const automated = (verificationItems ?? []).filter((item) => item.mode === "automated");
  assert(automated.length === 3 && automated.every((item) => item.status === "passed"), "All automated checks must pass first.");

  const results = new Map();
  const record = (key, summary, evidence = {}) => results.set(key, { summary, evidence });
  const stamp = Date.now();
  const recruitEmail = `pilot-recruit-${stamp}@example.test`;
  const producerEmail = `pilot-producer-${stamp}@example.test`;
  const clientName = `Local Pilot Client ${stamp}`;
  let clientId = null;
  let clientSubmitDate = null;
  let cleanupVerified = false;

  try {

  // Initial-admin Auth: the original provisioning already created the user and invite.
  const initialAdmin = await authUserByEmail(customer, build.initial_admin_email);
  assert(initialAdmin, "Initial customer admin Auth user is missing.");
  const initialOutbox = readFileSync(path.join(root, "mail", "outbox.jsonl"), "utf8")
    .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    .find((mail) => (Array.isArray(mail.to) ? mail.to : [mail.to]).includes(build.initial_admin_email));
  assert(initialOutbox, "Initial customer admin invite was not captured by the local mail sink.");
  const localPassword = `Local-${randomUUID()}!Aa9`;
  const passwordUpdate = await customer.auth.admin.updateUserById(initialAdmin.id, { password: localPassword, email_confirm: true });
  if (passwordUpdate.error) throw passwordUpdate.error;
  const signIn = await customerAnon.auth.signInWithPassword({ email: build.initial_admin_email, password: localPassword });
  assert(!signIn.error && signIn.data.user?.email?.toLowerCase() === build.initial_admin_email.toLowerCase(), "Initial admin password sign-in failed.");
  await customerAnon.auth.signOut();
  const recovery = await customer.auth.admin.generateLink({
    type: "recovery",
    email: build.initial_admin_email,
    options: { redirectTo: `${base}/auth/callback?next=/welcome` },
  });
  assert(!recovery.error && recovery.data?.properties?.hashed_token, "Initial admin recovery link generation failed.");
  record("admin-auth", "Local initial-admin invite exists; password sign-in and recovery-link generation both succeeded against Customer A Auth.", { localAuth: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.goto(`${browserBase}/auth/dev/as?role=builder`, { waitUntil: "load" });
    await page.waitForURL(/\/producer(?:\?|$|\/)/);
    await clearGatewayPromptThroughUi(page);
    await clearHeadshotWallThroughUi(page);
    await clearNpnRequestThroughUi(page);

    // Recruiting: use the real client form -> server action -> Auth link -> local mail sink.
    await page.goto(`${browserBase}/producer/recruiting?view=spreadsheet&add=1`, { waitUntil: "load" });
    const inviteEmail = page.locator('input[placeholder="Enter their email"]').first();
    await inviteEmail.fill(recruitEmail);
    await page.getByRole("button", { name: /Send 1 invite/i }).click();
    await waitForPerson(customer, recruitEmail);
    await page.reload({ waitUntil: "load" });
    assert((await page.locator("body").innerText()).includes(recruitEmail), "Invited recruit did not reopen in the Recruiting view.");
    record("recruiting", "Builder invited a new recruit through the real Recruiting UI; the recruit persisted and reopened in the customer-scoped pipeline.", { route: "/producer/recruiting" });

    // Downline: invite a licensed producer through the same real flow and verify hierarchy UI.
    await page.goto(`${browserBase}/producer/recruiting?view=spreadsheet&add=1`, { waitUntil: "load" });
    const producerInput = page.locator('input[placeholder="Enter their email"]').first();
    await producerInput.fill(producerEmail);
    await page.locator('select[aria-label="Role"]').first().selectOption("producer");
    await page.getByRole("button", { name: /Send 1 invite/i }).click();
    await waitForPerson(customer, producerEmail);
    await page.goto(`${browserBase}/producer/downline`, { waitUntil: "load" });
    assert((await page.locator("body").innerText()).includes(producerEmail), "Invited producer did not appear in My Downline.");
    record("downline", "A licensed producer invited through the real flow appeared under the builder in My Downline, confirming customer-local hierarchy loading.", { route: "/producer/downline" });

    // Client entry: create through the real ClientForm server action, then reopen it.
    await page.goto(`${browserBase}/producer/clients/new`, { waitUntil: "load" });
    await page.locator('input[placeholder="Full name"]').first().fill(clientName);
    await page.getByRole("button", { name: "Save client" }).click();
    await page.waitForURL(/\/producer\/clients\/[0-9a-f-]{36}(?:\?|$)/i);
    clientId = new URL(page.url()).pathname.split("/").pop();
    assert(clientId, "Saved client URL did not contain an id.");
    await page.goto(`${browserBase}/producer/clients/${clientId}`, { waitUntil: "load" });
    assert((await page.locator("body").innerText()).includes(clientName), "Saved client did not reopen from its detail route.");
    const { data: savedClient, error: savedClientError } = await customer
      .from("clients")
      .select("id, person_id, submit_date, date, sale_status")
      .eq("id", clientId)
      .single();
    if (savedClientError || !savedClient) throw savedClientError ?? new Error("Saved client was not found in Customer A.");
    clientSubmitDate = savedClient.submit_date || savedClient.date;
    assert(savedClient.sale_status === "sale" && clientSubmitDate, "Saved client did not enter the book of business as a sale.");
    record("client-entry", "Builder created a client through the real ClientForm server action and reopened the saved client detail route successfully.", { route: `/producer/clients/${clientId}` });

    // Sales reporting: the DB trigger must drive tracker.sales from the saved client.
    const trackerResponse = await context.request.get(`${browserBase}/api/producer/tracker?date=${encodeURIComponent(clientSubmitDate)}`);
    assert(trackerResponse.status() === 200, `Tracker API returned HTTP ${trackerResponse.status()}.`);
    const trackerBody = await trackerResponse.json();
    assert(trackerBody?.ok === true && Number(trackerBody?.entry?.sales) >= 1, "Tracker did not reflect the client-backed sale.");
    record("sales-reporting", "The real client save triggered the book-of-business sales sync, and the authenticated tracker API reported the sale for the same day.", { route: "/api/producer/tracker" });

    // Report-a-Bug: submit through the real modal and verify the local delivery envelope afterward.
    await page.goto(`${browserBase}/producer`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Report a bug" }).first().click();
    await page.locator('textarea[name="message"]').fill(`Local pilot verification ${stamp}`);
    await page.getByRole("button", { name: "Send report" }).click();
    await page.getByText("Report sent").waitFor();

    // Branding on an unauthenticated surface must come from Customer A installation_config.
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    try {
      const response = await publicPage.goto(`${browserBase}/auth/signin`, { waitUntil: "load" });
      assert(response?.status() === 200, "Customer sign-in page did not return 200.");
      await publicPage.getByText(build.product_name, { exact: true }).waitFor({ state: "visible" });
      const { data: installation, error: installationError } = await customer
        .from("installation_config")
        .select("logo_url, favicon_url")
        .eq("singleton", true)
        .single();
      if (installationError || !installation) throw installationError ?? new Error("Installation branding config is missing.");
      const logoSrc = await publicPage.locator("img.app-logo").getAttribute("src");
      assert(logoSrc === installation.logo_url, "Sign-in logo does not match Customer A installation config.");
      const iconHref = await publicPage.locator('link[rel="icon"]').first().getAttribute("href");
      assert(Boolean(iconHref), "Sign-in page favicon metadata is missing.");
      record("branding", "Unauthenticated sign-in rendered the Customer A product name, installation logo, and favicon metadata from Customer A configuration.", { route: "/auth/signin" });
    } finally {
      await publicContext.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Mail identity + bug routing use the local sink, never Resend.
  const mailRows = readFileSync(path.join(root, "mail", "outbox.jsonl"), "utf8")
    .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const recruitMail = [...mailRows].reverse().find((mail) => (Array.isArray(mail.to) ? mail.to : [mail.to]).includes(recruitEmail));
  assert(recruitMail, "Recruit invite was not captured by the local mail sink.");
  assert(recruitMail.from === build.email_from, "Recruit invite sender does not match customer email identity.");
  assert(recruitMail.replyTo === build.reply_to_email, "Recruit invite reply-to does not match customer configuration.");
  record("email-identity", "A real recruit invite was captured locally with the customer sender identity, configured reply-to, and intended recipient.", { localMailSink: true });

  const bugMail = [...mailRows].reverse().find((mail) => (Array.isArray(mail.to) ? mail.to : [mail.to]).includes(build.support_email));
  assert(bugMail, "Bug report was not routed to the customer support inbox in the local mail sink.");
  assert(bugMail.replyTo === "builder@allstar.test", "Bug report reply-to does not point to the signed-in reporter.");
  assert(bugMail.from === build.email_from, "Bug report sender does not use the customer email identity.");
  record("report-bug", "The real Report-a-Bug modal routed to the installation support inbox and used the signed-in reporter as reply-to in the local mail sink.", { localMailSink: true });

  // Cron authorization: fail closed for missing/bad auth, succeed only with the local installation secret.
  const cronUrl = `${base}/api/cron/compute-stalls`;
  const noAuth = await fetch(cronUrl, { cache: "no-store" });
  const badAuth = await fetch(cronUrl, { headers: { authorization: "Bearer definitely-wrong" }, cache: "no-store" });
  const cronSecret = deployment.environment?.CRON_SECRET;
  assert(typeof cronSecret === "string" && cronSecret.length >= 20, "Customer A local CRON_SECRET is missing.");
  const goodAuth = await fetch(cronUrl, { headers: { authorization: `Bearer ${cronSecret}` }, cache: "no-store" });
  assert(noAuth.status === 403 && badAuth.status === 403 && goodAuth.status === 200, `Cron auth contract failed (${noAuth.status}/${badAuth.status}/${goodAuth.status}).`);
  record("cron-auth", "Scheduled-job endpoint rejected missing and invalid Bearer auth and accepted the installation-local CRON_SECRET without exposing it.", { missingAuthStatus: noAuth.status, invalidAuthStatus: badAuth.status, authorizedStatus: goodAuth.status });

  // Storage isolation: create one A-only object, prove B has no matching object, then remove it.
  const isolationName = `verification/isolation-${stamp}.png`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=", "base64");
  const upload = await customer.storage.from("installation-assets").upload(isolationName, png, { contentType: "image/png", upsert: false });
  if (upload.error) throw upload.error;
  const dbA = new PgClient({ connectionString: customerA.dbUrl });
  const dbB = new PgClient({ connectionString: customerB.dbUrl });
  await Promise.all([dbA.connect(), dbB.connect()]);
  try {
    const [aCount, bCount, controlPlaneTable] = await Promise.all([
      dbA.query("select count(*)::int as count from storage.objects where bucket_id=$1 and name=$2", ["installation-assets", isolationName]),
      dbB.query("select count(*)::int as count from storage.objects where bucket_id=$1 and name=$2", ["installation-assets", isolationName]),
      dbA.query("select to_regclass('public.whitelabel_build') is null as isolated"),
    ]);
    assert(aCount.rows[0]?.count === 1 && bCount.rows[0]?.count === 0, "Customer storage object crossed the A/B project boundary.");
    record("upload-isolation", "A test upload existed in Customer A storage and had zero matching rows in the independent Customer B project.", { customerAObjectCount: 1, customerBObjectCount: 0 });

    const environmentText = JSON.stringify(deployment.environment ?? {});
    const isolationMarkers = [
      isolationProjectRef,
      customerB.canonicalAppUrl,
      customerB.apiUrl,
      customerB.dbUrl,
    ].filter(Boolean);
    assert(!isolationMarkers.some((marker) => environmentText.includes(String(marker))), "Customer A runtime environment contains an isolation-project reference.");
    assert(controlPlaneTable.rows[0]?.isolated === true, "Customer A unexpectedly contains the Assembly Line control-plane schema.");
    record("maintenance-onboarding", "Local maintenance/privacy check confirmed Customer A runtime contains no Customer B references and its database contains no Assembly Line control-plane tables.", { customerRuntimeIsolated: true, controlPlaneExcluded: true });
  } finally {
    await Promise.all([dbA.end(), dbB.end()]);
    await customer.storage.from("installation-assets").remove([isolationName]);
  }

  assert(results.size === 11, `Expected 11 manual verification results, got ${results.size}.`);

  // Clean browser-created fixtures before the verification gate can pass.
  await cleanupPilotFixtures(customer, customerA.dbUrl);
  cleanupVerified = true;

  // Stage evidence while rows remain pending. Only the final bulk status update
  // can make the manual gate green, so a mid-stage failure cannot partially pass it.
  const checkedAt = new Date().toISOString();
  for (const [checkKey, result] of results) {
    const saved = await control
      .from("whitelabel_verification_item")
      .update({
        actual_summary: result.summary,
        evidence: result.evidence,
      })
      .eq("build_id", build.id)
      .eq("run_id", verificationRun.id)
      .eq("check_key", checkKey)
      .eq("mode", "manual")
      .eq("required_for_handoff", true)
      .select("id")
      .single();
    if (saved.error || !saved.data) throw saved.error ?? new Error(`Could not save verification result ${checkKey}.`);
  }

  const manualItemIds = (verificationItems ?? [])
    .filter((item) => item.mode === "manual" && item.required_for_handoff)
    .map((item) => item.id);
  assert(manualItemIds.length === results.size, "Manual verification item set changed during the run.");
  const passed = await control
    .from("whitelabel_verification_item")
    .update({ status: "passed", checked_by: actor.id, checked_at: checkedAt })
    .in("id", manualItemIds)
    .eq("run_id", verificationRun.id)
    .eq("build_id", build.id)
    .eq("mode", "manual")
    .eq("required_for_handoff", true)
    .select("id");
  if (passed.error || (passed.data ?? []).length !== manualItemIds.length) {
    throw passed.error ?? new Error("Could not atomically mark all manual verification items passed.");
  }

  const finalized = await control.rpc("finalize_whitelabel_verification", {
    p_build_id: build.id,
    p_run_id: verificationRun.id,
    p_actor_id: actor.id,
  });
  if (finalized.error) throw finalized.error;
  assert(finalized.data === "passed", `Verification finalized as ${String(finalized.data)} instead of passed.`);

  process.stdout.write(JSON.stringify({
    runId: verificationRun.id,
    status: finalized.data,
    manualPassed: [...results.keys()].sort(),
    fixturesCleaned: true,
    cloudCalls: false,
  }) + "\n");
  } finally {
    if (!cleanupVerified) {
      try {
        await cleanupPilotFixtures(customer, customerA.dbUrl);
      } catch (cleanupError) {
        console.error(`Emergency local fixture cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error));
  process.exitCode = 1;
});
