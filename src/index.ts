/**
 * pi extension for Maritaca AI
 *
 * @packageDocumentation
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import Debug from "debug";

const debug = Debug("pi-maritaca");

type ApiFormat = "openai-completions" | "openai-responses";

const API_FORMATS: readonly ApiFormat[] = ["openai-completions", "openai-responses"];

interface MaritacaConfig {
  apiBaseUrl?: string;
  apiFormat?: ApiFormat;
}

export const DEFAULT_CONFIG: Required<MaritacaConfig> = {
  apiBaseUrl: "https://chat.maritaca.ai/api",
  apiFormat: "openai-responses",
};

interface MaritacaModel {
  id: string;
  name?: string;
  owned_by?: string;
  /** Context window in tokens (documented top-level field of /api/models). */
  context_length?: number;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
  };

  // additional fields
  [key: string]: unknown;
}

interface ModelsResponse {
  data: MaritacaModel[];
}

/** pi env-interpolation template resolved by pi at request time. */
const API_KEY_TEMPLATE = "$MARITACA_API_KEY";

/**
 * pi thinking levels -> Maritaca `reasoning.effort` values.
 *
 * Maritaca accepts: none, minimal, low, medium, high, xhigh, max.
 * pi levels pass through unchanged except "off" -> "none". xhigh/max must be
 * listed explicitly or pi hides them from the thinking-level selector.
 */
const THINKING_LEVEL_MAP = {
  off: "none",
  xhigh: "xhigh",
  max: "max",
};

/**
 * Compatibility flags, verified against the live API:
 *
 * - supportsStore: Maritaca rejects the `store` field with HTTP 422.
 * - supportsLongCacheRetention: Maritaca rejects `prompt_cache_retention: "24h"`
 *   (and `prompt_cache_key` on Chat Completions) with HTTP 422. Prompt caching
 *   itself is automatic server-side, no client parameter needed.
 * - supportsStrictMode: both endpoints accept `strict: true` tool schemas.
 */
const MARITACA_COMPAT = {
  supportsStore: false,
  supportsLongCacheRetention: false,
  supportsStrictMode: true,
};

/** S5 family (S5, S5-free, S5-br-sp, S5-nano) and Sabia 4 Thinking models reason. */
function isReasoningModel(id: string): boolean {
  return /^s5(?:-|$)/i.test(id) || /thinking/i.test(id);
}

type InputModality = "text" | "image";

/** Safe default for models missing from MODEL_INPUTS — text always works. */
const TEXT_ONLY_INPUT: InputModality[] = ["text"];

/**
 * Input modalities per model. Hardcoded because GET /api/models advertises no
 * capability field (payload is only context_length, created, id, object,
 * owned_by, top_provider), so there is nothing to read even in principle.
 *
 * Verified against the live API: every current model accepts image input
 * (OCR-extracted server-side) except S5-free, which rejects attachments with
 * HTTP 400 ("does not accept attachments").
 *
 * Unknown/future models fall back to text-only. When Maritaca ships a new
 * model, extend this table via issue + PR.
 */
const MODEL_INPUTS: Record<string, InputModality[]> = {
  "sabia-4": ["text", "image"],
  "sabia-4-br-sp": ["text", "image"],
  "sabia-4-thinking": ["text", "image"],
  "sabia-4-thinking-br-sp": ["text", "image"],
  "sabiazinho-4": ["text", "image"],
  "sabiazinho-4-br-sp": ["text", "image"],
  S5: ["text", "image"],
  "S5-br-sp": ["text", "image"],
  "S5-nano": ["text", "image"],
  "S5-free": ["text"],
};

/** Built-in (server-side) tool identifiers accepted by Maritaca's API. */
export type BuiltInTool = "web_search" | "code_execution" | "data_ocean" | "image_generation";

/**
 * Built-in server tools confirmed available per model — hardcoded because
 * /api/models advertises no capabilities and Maritaca's docs are stale in
 * both directions (their tools table omits every -br-sp variant, all of which
 * behave identically to their bases; their 400 error text claims
 * code_execution/data_ocean are "only on sabia-4 and sabia-4-thinking" while
 * the whole S5 family passes validation).
 *
 * Every cell was probed live (10 models × 4 tools). A tool is listed when
 * validation allows it AND it either executed in a probe or is docs-asserted
 * with no contradicting evidence:
 *
 * - web_search: live execution proven (~12s sourced answer); unavailable on
 *   S5-free only (HTTP 400).
 * - image_generation: execution proven (image_generation_call item on
 *   S5-br-sp); unavailable on the sabiazinho-4 family and S5-free (HTTP 400).
 * - data_ocean: live sourced answers on S5 (~80s agentic runs); unavailable
 *   on the sabiazinho-4 family and S5-free (HTTP 400). On the S5 family the
 *   underlying mechanism is unconfirmed (may ride on auto-enabled web_search).
 * - code_execution: sabia-4 family only — docs-asserted, but execution was
 *   never observed in five probe attempts across both API forms (flag and
 *   {"type":"code_interpreter"}): models confabulated output instead of
 *   running code. Excluded from the S5 family despite passing validation:
 *   the model itself reports having no tool provisioned (three attempts,
 *   Python and bash).
 *
 * Streaming: Maritaca rejects ALL server tools with HTTP 400
 * streaming_not_supported when stream=true. pi hardcodes stream:true, so
 * enabling these tools in requests requires a payload override to stream:false.
 *
 * Maintain via issue + PR when Maritaca changes availability.
 */
export const MODEL_TOOLS: Record<string, BuiltInTool[]> = {
  "sabia-4": ["web_search", "code_execution", "data_ocean", "image_generation"],
  "sabia-4-br-sp": ["web_search", "code_execution", "data_ocean", "image_generation"],
  "sabia-4-thinking": ["web_search", "code_execution", "data_ocean", "image_generation"],
  "sabia-4-thinking-br-sp": ["web_search", "code_execution", "data_ocean", "image_generation"],
  "sabiazinho-4": ["web_search"],
  "sabiazinho-4-br-sp": ["web_search"],
  S5: ["web_search", "data_ocean", "image_generation"],
  "S5-br-sp": ["web_search", "data_ocean", "image_generation"],
  "S5-nano": ["web_search", "data_ocean", "image_generation"],
  "S5-free": [],
};

function resolveApiFormat(apiFormat?: ApiFormat): ApiFormat {
  // Config takes precedence
  if (apiFormat) {
    if (!API_FORMATS.includes(apiFormat)) {
      throw new Error(
        `Invalid apiFormat: "${apiFormat}". Must be one of: ${API_FORMATS.join(", ")}`,
      );
    }

    return apiFormat;
  }

  // Fall back to env var
  const envValue = process.env.MARITACA_API_FORMAT;

  if (envValue) {
    if (!API_FORMATS.includes(envValue as ApiFormat)) {
      throw new Error(
        `Invalid MARITACA_API_FORMAT: "${envValue}". Must be one of: ${API_FORMATS.join(", ")}`,
      );
    }
    return envValue as ApiFormat;
  }

  // Fall back to default
  return DEFAULT_CONFIG.apiFormat;
}

/**
 * Creates the provider extension
 *
 * @param config - Optional configuration overrides
 * @returns Extension factory function for pi
 *
 * Configuration precedence: config param > environment variable > default.
 * Environment variables: MARITACA_API_KEY, MARITACA_API_BASE_URL,
 * MARITACA_API_FORMAT ("openai-responses" | "openai-completions").
 *
 * @example
 * ```typescript
 * import { createMaritacaExtension } from "pi-maritaca";
 *
 * // Default: openai-responses (Maritaca's recommended API)
 * export default createMaritacaExtension();
 *
 * // Use the Chat Completions API instead
 * export default createMaritacaExtension({ apiFormat: "openai-completions" });
 * ```
 */
export function createMaritacaExtension(config?: MaritacaConfig) {
  // Precedence: config param > env var > default. Do NOT merge defaults into
  // `config` first — that would make every field "defined" and hide the env
  // fallbacks below.
  const apiFormat = resolveApiFormat(config?.apiFormat);
  const apiBaseUrl =
    config?.apiBaseUrl ?? process.env.MARITACA_API_BASE_URL ?? DEFAULT_CONFIG.apiBaseUrl;
  const apiKey = API_KEY_TEMPLATE;

  debug("config: apiFormat=%s apiBaseUrl=%s", apiFormat, apiBaseUrl);

  return function maritacaExtension(pi: ExtensionAPI): void {
    pi.on("input", async (event, ctx) => {
      if (event.text === "/login maritaca") {
        debug("`/login maritaca` intercepted, showing API key notice");
        ctx.ui.notify(
          "Authentication is API key-only. Set MARITACA_API_KEY environment variable.",
          "info",
        );
        return { action: "handled" };
      }
      return { action: "continue" };
    });

    pi.registerProvider("maritaca", {
      name: "Maritaca AI",
      api: apiFormat,
      baseUrl: apiBaseUrl,
      authHeader: true,
      apiKey: apiKey,

      async refreshModels(context: {
        signal: AbortSignal;
        credential?: { type: string; key?: string };
      }) {
        const { signal, credential } = context;
        const modelsUrl = `${apiBaseUrl}/models`;
        debug("fetching models from %s", modelsUrl);

        // Prefer pi's stored credential; fall back to the env var at call time
        // (never capture it at factory time — the key may be set later).
        const key =
          (credential?.type === "api_key" ? credential.key : undefined) ??
          process.env.MARITACA_API_KEY ??
          "";

        const response = await fetch(modelsUrl, {
          signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
          },
        });

        debug("response status: %d", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          debug("error: %s", errorText);
          throw new Error(
            `Failed to fetch Maritaca AI models: ${response.status} ${response.statusText}\n${errorText}`,
          );
        }

        const payload = (await response.json()) as ModelsResponse;

        if (!Array.isArray(payload.data)) {
          debug("invalid payload: %o", payload);
          throw new Error("Invalid response format: expected 'data' to be an array");
        }

        debug("received %d models", payload.data.length);

        return payload.data.map((model) => {
          const reasoning = isReasoningModel(model.id);

          // Strictly Maritaca's own metadata — no invented defaults. pi requires
          // these numbers, so a payload change must fail loudly, not silently
          // register a model with a wrong context window.
          const contextWindow = model.context_length ?? model.top_provider?.context_length;
          const maxTokens = model.top_provider?.max_completion_tokens;
          if (contextWindow === undefined || maxTokens === undefined) {
            debug("missing metadata for model %s: %o", model.id, model);
            throw new Error(
              `Maritaca model "${model.id}" is missing metadata: ` +
                `context_length=${contextWindow ?? "absent"}, ` +
                `top_provider.max_completion_tokens=${maxTokens ?? "absent"}. ` +
                `The /api/models payload shape may have changed.`,
            );
          }

          const input = MODEL_INPUTS[model.id];
          if (!input) {
            debug("model %s missing from MODEL_INPUTS; defaulting to text-only input", model.id);
          }

          return {
            id: model.id,
            name: model.name ?? model.id,
            reasoning,
            ...(reasoning ? { thinkingLevelMap: THINKING_LEVEL_MAP } : {}),
            input: input ?? TEXT_ONLY_INPUT,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow,
            maxTokens,
            compat: MARITACA_COMPAT,
          };
        });
      },
    });
  };
}

export default createMaritacaExtension();
