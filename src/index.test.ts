/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMaritacaExtension, DEFAULT_CONFIG, MODEL_TOOLS } from "./index.js";

function mockFetch() {
  const fn = vi.fn();
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function mockPi() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    }),
    registerProvider: vi.fn(),
    _handler(event: string) {
      return handlers.get(event);
    },
  };
}

function mockCtx() {
  return { ui: { notify: vi.fn() } };
}

const ENV_VARS = ["MARITACA_API_BASE_URL", "MARITACA_API_FORMAT", "MARITACA_API_KEY"] as const;

const ENV_BACKUP: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of ENV_VARS) {
    ENV_BACKUP[name] = process.env[name];
    // Start every test from a clean slate
    delete process.env[name];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_VARS) {
    const value = ENV_BACKUP[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("createMaritacaExtension", () => {
  it("returns a function", () => {
    expect(createMaritacaExtension()).toBeInstanceOf(Function);
  });

  describe("config precedence: config param > env var > default", () => {
    it("uses defaults when nothing is provided", () => {
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({
          baseUrl: DEFAULT_CONFIG.apiBaseUrl,
          apiKey: "$MARITACA_API_KEY",
          authHeader: true,
          api: "openai-responses",
        }),
      );
    });

    it("registers $MARITACA_API_KEY so pi resolves the key at request time", () => {
      // Even with the env var set, pi receives the template and resolves it
      // per request — the factory never captures a key value.
      process.env.MARITACA_API_KEY = "xpl_abc123def456abc123def456abc123def456";
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({
          apiKey: "$MARITACA_API_KEY",
        }),
      );
    });

    it("reads MARITACA_API_BASE_URL env var", () => {
      process.env.MARITACA_API_BASE_URL = "https://selfhosted.example.com/v1";
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({
          baseUrl: "https://selfhosted.example.com/v1",
        }),
      );
    });

    it("reads MARITACA_API_FORMAT env var", () => {
      process.env.MARITACA_API_FORMAT = "openai-completions";
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({ api: "openai-completions" }),
      );
    });

    it("config param overrides MARITACA_API_BASE_URL env var", () => {
      process.env.MARITACA_API_BASE_URL = "https://env.example.com/v1";
      const pi = mockPi();
      createMaritacaExtension({ apiBaseUrl: "https://config.example.com/v1" })(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({
          baseUrl: "https://config.example.com/v1",
        }),
      );
    });

    it("config param overrides MARITACA_API_FORMAT env var", () => {
      process.env.MARITACA_API_FORMAT = "openai-completions";
      const pi = mockPi();
      createMaritacaExtension({ apiFormat: "openai-responses" })(pi as never);

      expect(pi.registerProvider).toHaveBeenCalledWith(
        "maritaca",
        expect.objectContaining({ api: "openai-responses" }),
      );
    });

    it("throws on invalid apiFormat in config", () => {
      // @ts-expect-error – testing invalid value at runtime
      expect(() => createMaritacaExtension({ apiFormat: "bogus-format" })).toThrow(
        /Invalid apiFormat/,
      );
    });

    it("throws on invalid MARITACA_API_FORMAT env var", () => {
      process.env.MARITACA_API_FORMAT = "bogus-format";
      expect(() => createMaritacaExtension()).toThrow(/Invalid MARITACA_API_FORMAT/);
    });

    it("throws on empty apiFormat in config (never silently falls through)", () => {
      // @ts-expect-error – empty string is not a valid ApiFormat at compile time
      expect(() => createMaritacaExtension({ apiFormat: "" })).toThrow(/Invalid apiFormat/);
    });

    it("throws on empty apiBaseUrl in config (would otherwise propagate \"\")", () => {
      expect(() => createMaritacaExtension({ apiBaseUrl: "" })).toThrow(/Invalid apiBaseUrl/);
    });

    it("throws on whitespace-only apiBaseUrl in config", () => {
      expect(() => createMaritacaExtension({ apiBaseUrl: "   " })).toThrow(/Invalid apiBaseUrl/);
    });

    it("throws on empty MARITACA_API_FORMAT env var (no silent fallback to default)", () => {
      process.env.MARITACA_API_FORMAT = "";
      expect(() => createMaritacaExtension()).toThrow(/Invalid MARITACA_API_FORMAT/);
    });

    it("throws on empty MARITACA_API_BASE_URL env var (refuses to build a provider with \"\")", () => {
      process.env.MARITACA_API_BASE_URL = "";
      expect(() => createMaritacaExtension()).toThrow(/Invalid MARITACA_API_BASE_URL/);
    });

    it("throws on whitespace-only MARITACA_API_BASE_URL env var", () => {
      process.env.MARITACA_API_BASE_URL = "\t\n  ";
      expect(() => createMaritacaExtension()).toThrow(/Invalid MARITACA_API_BASE_URL/);
    });

    it("throws on untrimmed env value with trailing newline (caller must supply well-formed strings)", () => {
      process.env.MARITACA_API_FORMAT = "openai-completions\n";
      expect(() => createMaritacaExtension()).toThrow(/Invalid MARITACA_API_FORMAT/);
    });
  });
});

describe("extension function", () => {
  it("registers the provider with name 'maritaca'", () => {
    const pi = mockPi();
    createMaritacaExtension()(pi as never);

    expect(pi.registerProvider).toHaveBeenCalledWith("maritaca", expect.any(Object));
  });

  it("registers an input listener", () => {
    const pi = mockPi();
    createMaritacaExtension()(pi as never);

    expect(pi.on).toHaveBeenCalledWith("input", expect.any(Function));
  });

  describe("/login maritaca interception", () => {
    it("returns { action: 'handled' } and shows a notification", async () => {
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      const handler = pi._handler("input");
      const ctx = mockCtx();
      const result = await handler!({ text: "/login maritaca" }, ctx);

      expect(result).toEqual({ action: "handled" });
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("API key"), "info");
    });

    it("returns { action: 'continue' } for other inputs", async () => {
      const pi = mockPi();
      createMaritacaExtension()(pi as never);

      const handler = pi._handler("input");
      const ctx = mockCtx();
      const result = await handler!({ text: "/model" }, ctx);

      expect(result).toEqual({ action: "continue" });
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });
  });
});

describe("refreshModels", () => {
  let fetch: ReturnType<typeof mockFetch>;
  let pi: ReturnType<typeof mockPi>;
  let provider: Record<string, unknown>;

  beforeEach(() => {
    fetch = mockFetch();
    pi = mockPi();
    createMaritacaExtension()(pi as never);
    provider = pi.registerProvider.mock.calls[0][1];
  });

  it("fetches from {baseUrl}/models", async () => {
    fetch.mockResolvedValue(mockResponse({ data: [] }));

    await provider.refreshModels({ signal: new AbortController().signal });

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_CONFIG.apiBaseUrl}/models`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("sends the Authorization header", async () => {
    process.env.MARITACA_API_KEY = "xpl_my_test_key";
    fetch.mockResolvedValue(mockResponse({ data: [] }));

    await provider.refreshModels({ signal: new AbortController().signal });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer xpl_my_test_key",
        }),
      }),
    );
  });

  it("prefers a stored credential over the env var", async () => {
    process.env.MARITACA_API_KEY = "env_key";
    fetch.mockResolvedValue(mockResponse({ data: [] }));

    await provider.refreshModels({
      signal: new AbortController().signal,
      credential: { type: "api_key", key: "stored_key" },
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer stored_key",
        }),
      }),
    );
  });

  it("passes the abort signal", async () => {
    const signal = new AbortController().signal;
    fetch.mockResolvedValue(mockResponse({ data: [] }));

    await provider.refreshModels({ signal });

    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
  });

  it("maps models from the response", async () => {
    // Shape verified against GET https://chat.maritaca.ai/api/models
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "sabia-4",
            object: "model",
            created: 1767657600,
            owned_by: "maritacaai",
            context_length: 128_000,
            top_provider: { context_length: 128_000, max_completion_tokens: 32_768 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models).toEqual([
      {
        id: "sabia-4",
        name: "sabia-4",
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 32_768,
        input: ["text", "image"],
        compat: {
          supportsStore: false,
          supportsLongCacheRetention: false,
          supportsStrictMode: true,
        },
      },
    ]);
  });

  it("reads top-level context_length when top_provider.context_length is absent", async () => {
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "S5",
            object: "model",
            created: 1793318400,
            owned_by: "maritacaai",
            context_length: 1_000_000,
            top_provider: { max_completion_tokens: 65_536 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models[0]).toMatchObject({
      contextWindow: 1_000_000,
      maxTokens: 65_536,
    });
  });

  it("throws instead of guessing when a model lacks metadata", async () => {
    // No silent 128k/4096 fallback: a payload shape change must fail loudly.
    fetch.mockResolvedValue(
      mockResponse({
        data: [{ id: "mystery-model", object: "model" }],
      }),
    );

    await expect(provider.refreshModels({ signal: new AbortController().signal })).rejects.toThrow(
      /mystery-model.*missing metadata/,
    );
  });

  it("declares input modalities from the hardcoded per-model table", async () => {
    // /api/models exposes no capability field; the table in index.ts is the
    // source of truth, verified against the live API.
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "sabia-4",
            context_length: 128_000,
            top_provider: { max_completion_tokens: 32_768 },
          },
          {
            id: "S5-free",
            context_length: 1_000_000,
            top_provider: { max_completion_tokens: 65_536 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models[0].input).toEqual(["text", "image"]);
    expect(models[1].input).toEqual(["text"]);
  });

  it("defaults unknown future models to text-only input", async () => {
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "sabia-9-future",
            context_length: 200_000,
            top_provider: { max_completion_tokens: 32_768 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models[0].input).toEqual(["text"]);
  });

  it("marks S5 and thinking models as reasoning with a thinking level map", async () => {
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "S5-free",
            context_length: 1_000_000,
            top_provider: { max_completion_tokens: 65_536 },
          },
          {
            id: "sabia-4-thinking",
            context_length: 1_000_000,
            top_provider: { max_completion_tokens: 32_768 },
          },
          {
            id: "sabiazinho-4",
            context_length: 128_000,
            top_provider: { max_completion_tokens: 32_768 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models[0]).toMatchObject({
      reasoning: true,
      thinkingLevelMap: { off: "none", xhigh: "xhigh", max: "max" },
    });
    expect(models[1]).toMatchObject({ reasoning: true });
    // Non-reasoning models must not carry a level map.
    expect(models[2]).not.toHaveProperty("thinkingLevelMap");
    expect(models[2].reasoning).toBe(false);
  });

  it("uses model.name when available", async () => {
    fetch.mockResolvedValue(
      mockResponse({
        data: [
          {
            id: "sabia-4",
            name: "Sabiá 4",
            object: "model",
            owned_by: "maritacaai",
            context_length: 128_000,
            top_provider: { max_completion_tokens: 32_768 },
          },
        ],
      }),
    );

    const models = await provider.refreshModels({
      signal: new AbortController().signal,
    });

    expect(models[0].name).toBe("Sabiá 4");
  });

  it("throws on non-ok response", async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "A valid gateway Bearer key is required.",
            type: "authentication_error",
            code: "invalid_key",
          },
        }),
        {
          status: 401,
          statusText: "Unauthorized",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(provider.refreshModels({ signal: new AbortController().signal })).rejects.toThrow(
      /Failed to fetch Maritaca AI models/,
    );
  });

  it("throws when response body lacks data array", async () => {
    fetch.mockResolvedValue(mockResponse({ error: "not found" }));

    await expect(provider.refreshModels({ signal: new AbortController().signal })).rejects.toThrow(
      /Invalid response format/,
    );
  });
});

describe("MODEL_TOOLS", () => {
  it("pins the live-verified built-in tool availability matrix", () => {
    // Every model must have an entry (empty = no built-in tools).
    expect(Object.keys(MODEL_TOOLS).sort()).toEqual(
      [
        "S5",
        "S5-br-sp",
        "S5-free",
        "S5-nano",
        "sabia-4",
        "sabia-4-br-sp",
        "sabia-4-thinking",
        "sabia-4-thinking-br-sp",
        "sabiazinho-4",
        "sabiazinho-4-br-sp",
      ].sort(),
    );

    // web_search: every model except S5-free.
    expect(MODEL_TOOLS["S5-free"]).toEqual([]);
    expect(MODEL_TOOLS["sabiazinho-4"]).toEqual(["web_search"]);
    expect(MODEL_TOOLS["sabiazinho-4-br-sp"]).toEqual(["web_search"]);

    // code_execution: sabia-4 family only — S5 passes validation but the
    // model itself reports no tool provisioned.
    expect(MODEL_TOOLS["sabia-4"]).toContain("code_execution");
    expect(MODEL_TOOLS["sabia-4-thinking-br-sp"]).toContain("code_execution");
    expect(MODEL_TOOLS["S5"]).not.toContain("code_execution");
    expect(MODEL_TOOLS["S5-nano"]).not.toContain("code_execution");

    // S5 family: web_search + data_ocean + image_generation.
    expect(MODEL_TOOLS["S5"]).toEqual(["web_search", "data_ocean", "image_generation"]);
    expect(MODEL_TOOLS["S5-br-sp"]).toEqual(["web_search", "data_ocean", "image_generation"]);

    // sabia-4 family: everything.
    expect(MODEL_TOOLS["sabia-4"]).toEqual([
      "web_search",
      "code_execution",
      "data_ocean",
      "image_generation",
    ]);
  });
});
