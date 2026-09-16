import { createClient } from "@supabase/supabase-js";
import {
  executeNextProvisioningStep,
  startProvisioning,
} from "@/lib/whitelabel/provisioning/orchestrator";

async function main() {
  const target = (process.argv[2] ?? "a").toLowerCase();
  const maxStepsArg = process.argv.find((arg) => arg.startsWith("--max-steps="));
  const maxSteps = maxStepsArg ? Number(maxStepsArg.split("=")[1]) : 40;
  const retryFailed = process.argv.includes("--retry-failed");
  if (target !== "a" && target !== "b") {
    throw new Error("Usage: tsx scripts/whitelabel-local-pilot-provision.ts <a|b> [--max-steps=N] [--retry-failed]");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 0 || maxSteps > 40) {
    throw new Error("--max-steps must be an integer between 0 and 40.");
  }
  if (process.env.WHITELABEL_LOCAL_PILOT !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("This runner is local-pilot only.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sourceSha = process.env.WHITELABEL_SOURCE_SHA;
  if (!url || !serviceKey || !sourceSha) throw new Error("Local control-plane env is incomplete.");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const domain = `customer-${target}.local`;

  const [{ data: build, error: buildError }, { data: actor, error: actorError }] = await Promise.all([
    admin.from("whitelabel_build").select("id").eq("domain", domain).single(),
    admin.from("person").select("id").eq("email", "admin@allstar.test").single(),
  ]);
  if (buildError || !build) throw buildError ?? new Error(`Pilot build ${domain} is missing.`);
  if (actorError || !actor) throw actorError ?? new Error("Pilot admin actor is missing.");

  let state = await startProvisioning({
    buildId: build.id,
    sourceSha,
    actorId: actor.id,
  });

  const report = () => ({
    runId: state.run.id,
    status: state.run.status,
    currentStep: state.run.current_step,
    lastError: state.run.last_error,
    steps: state.steps.map((step) => ({
      key: step.step_key,
      status: step.status,
      attempts: step.attempt_count,
      error: step.last_error,
    })),
  });

  for (let iteration = 0; iteration < maxSteps; iteration += 1) {
    if (state.run.status === "succeeded" || state.run.status === "cancelled") break;
    if (state.run.status === "blocked" || (state.run.status === "failed" && !retryFailed)) {
      console.log(JSON.stringify(report()));
      process.exitCode = 2;
      break;
    }
    state = await executeNextProvisioningStep({ buildId: build.id, runId: state.run.id });
    console.log(JSON.stringify({
      iteration: iteration + 1,
      status: state.run.status,
      currentStep: state.run.current_step,
      lastError: state.run.last_error,
    }));
  }

  console.log(JSON.stringify(report()));
  if (state.run.status !== "succeeded") process.exitCode = process.exitCode || 3;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
