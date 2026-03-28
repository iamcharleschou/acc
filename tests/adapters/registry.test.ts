import { describe, expect, it } from "vitest";
import { AccValidationError } from "../../src/core/errors.js";
import { parseClaudeProvider } from "../../src/adapters/claude/schema.js";
import { parseCodexProvider } from "../../src/adapters/codex/schema.js";
import { parseGeminiProvider } from "../../src/adapters/gemini/schema.js";

describe("provider parsers", () => {
  it("Claude provider requires exactly one credential", () => {
    expect(() =>
      parseClaudeProvider("anthropic", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com"
        }
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseClaudeProvider("anthropic", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "key",
          ANTHROPIC_AUTH_TOKEN: "token"
        }
      })
    ).toThrow(AccValidationError);

    expect(
      parseClaudeProvider("anthropic", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "key",
          EXTRA_ENV: "extra"
        }
      })
    ).toEqual({
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "key",
          EXTRA_ENV: "extra"
        }
      }
    });
  });

  it("Codex provider requires baseUrl and apiKey", () => {
    expect(() =>
      parseCodexProvider("openai", {
        alias: "dev",
        apiKey: "secret"
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseCodexProvider("openai", {
        alias: "dev",
        baseUrl: "https://api.openai.com/v1"
      })
    ).toThrow(AccValidationError);

    expect(
      parseCodexProvider("openai", {
        alias: "dev",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret"
      })
    ).toEqual({
      alias: "dev",
      providerName: "openai",
      config: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret",
        wireApi: "responses",
        requiresOpenAiAuth: true
      }
    });
  });

  it("Gemini provider requires GEMINI_API_KEY", () => {
    expect(() =>
      parseGeminiProvider("google", {
        alias: "official",
        env: {}
      })
    ).toThrow(AccValidationError);

    expect(
      parseGeminiProvider("google", {
        alias: "official",
        env: {
          GEMINI_API_KEY: "secret"
        }
      })
    ).toEqual({
      alias: "official",
      providerName: "google",
      config: {
        env: {
          GEMINI_API_KEY: "secret"
        }
      }
    });

    expect(() =>
      parseGeminiProvider("google", {
        alias: "official",
        env: {
          GEMINI_API_KEY: "secret",
          "BAD-KEY": "invalid"
        }
      })
    ).toThrow(AccValidationError);
  });

  it("rejects whitespace-only values for persisted fields", () => {
    expect(() =>
      parseClaudeProvider("   ", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "key"
        }
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseClaudeProvider("anthropic", {
        alias: "   ",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "key"
        }
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseClaudeProvider("anthropic", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "   ",
          ANTHROPIC_API_KEY: "key"
        }
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseClaudeProvider("anthropic", {
        alias: "yh",
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "   "
        }
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseCodexProvider("   ", {
        alias: "dev",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret"
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseCodexProvider("openai", {
        alias: "   ",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret"
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseCodexProvider("openai", {
        alias: "dev",
        baseUrl: "   ",
        apiKey: "secret"
      })
    ).toThrow(AccValidationError);

    expect(() =>
      parseCodexProvider("openai", {
        alias: "dev",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "   "
      })
    ).toThrow(AccValidationError);
  });

  it("rejects invalid Codex wireApi values", () => {
    expect(() =>
      parseCodexProvider("openai", {
        alias: "dev",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret",
        wireApi: "chat_completions"
      })
    ).toThrow(AccValidationError);
  });

  it("rejects TOML-unsafe Codex alias values", () => {
    for (const alias of ["bad.alias", "bad alias", "bad]alias"]) {
      expect(() =>
        parseCodexProvider("openai", {
          alias,
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret"
        })
      ).toThrow(AccValidationError);
    }
  });
});
