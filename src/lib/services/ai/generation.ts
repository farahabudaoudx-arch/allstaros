import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { getInstallationServiceBinding } from "@/lib/services/bindings";
import type { Usage } from "@/lib/ai/usage";

export const DEFAULT_STANDARD_COACH_MODEL = "claude-haiku-4-5-20251001";

export type AiGenerationResult =
  | { ok: true; text: string; model: string; usage: Usage }
  | { ok: false; error: string };

export async function configuredAiProvider(): Promise<string | null> {
  const binding = await getInstallationServiceBinding("ai");
  if (binding) {
    if (binding.status !== "configured") return null;
    return binding.providerKey;
  }
  const fromEnv = process.env.INSTALLATION_AI_PROVIDER?.trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
}

export async function generateStandardCoachResponse(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AiGenerationResult> {
  const provider = await configuredAiProvider();
  if (!provider) {
    return { ok: false, error: "The AI coach is not connected for this installation yet." };
  }
  if (provider !== "anthropic") {
    return {
      ok: false,
      error: `The configured AI provider (${provider}) needs its purchased provider adapter before the coach can run.`,
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "The Anthropic credential is missing from this installation." };

  const model = process.env.INSTALLATION_AI_MODEL?.trim() || DEFAULT_STANDARD_COACH_MODEL;
  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model,
      max_tokens: 1024,
      system: params.system,
      messages: params.messages,
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return {
      ok: true,
      text: text || "(empty response)",
      model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch {
    return { ok: false, error: "The configured AI provider could not complete this request." };
  }
}
