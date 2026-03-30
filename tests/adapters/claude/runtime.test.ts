import { describe, expect, it } from "vitest";
import { buildClaudeRuntimeSettings, buildClaudeUseArgs } from "../../../src/adapters/claude/runtime.js";

describe("Claude runtime helpers", () => {
  it("buildClaudeRuntimeSettings preserves top-level settings and overlays provider env", () => {
    const userSettings = {
      outputStyle: "verbose",
      nested: {
        keep: true
      },
      env: {
        KEEP_ME: "yes",
        ANTHROPIC_BASE_URL: "https://user.example.com",
        ANTHROPIC_AUTH_TOKEN: "user-token"
      }
    };
    const provider = {
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "provider-token"
        }
      }
    };

    const actual = buildClaudeRuntimeSettings(userSettings, provider);

    expect(actual.outputStyle).toBe("verbose");
    expect(actual.nested).toEqual({ keep: true });
    expect(actual.env).toEqual({
      KEEP_ME: "yes",
      ANTHROPIC_BASE_URL: "https://provider.example.com",
      ANTHROPIC_AUTH_TOKEN: "provider-token"
    });
  });

  it("buildClaudeRuntimeSettings adds apiKeyHelper and cleans conflicting auth fields for API key auth", () => {
    const userSettings = {
      apiKeyHelper: "echo 'old-key'",
      env: {
        KEEP_ME: "yes",
        ANTHROPIC_AUTH_TOKEN: "token-to-remove",
        ANTHROPIC_API_KEY: "old-key"
      }
    };
    const provider = {
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_API_KEY: "new-key"
        }
      }
    };

    const actual = buildClaudeRuntimeSettings(userSettings, provider);

    expect(actual.apiKeyHelper).toBe("printf '%s' 'new-key'");
    expect(actual.env).toEqual({
      KEEP_ME: "yes",
      ANTHROPIC_BASE_URL: "https://provider.example.com",
      ANTHROPIC_API_KEY: "new-key"
    });
    expect(actual.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });

  it("buildClaudeRuntimeSettings ignores array-shaped user env values", () => {
    const userSettings = {
      outputStyle: "compact",
      env: ["SHOULD_NOT_BE_MERGED"]
    };
    const provider = {
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "provider-token"
        }
      }
    };

    const actual = buildClaudeRuntimeSettings(userSettings, provider);

    expect(actual.outputStyle).toBe("compact");
    expect(actual.env).toEqual({
      ANTHROPIC_BASE_URL: "https://provider.example.com",
      ANTHROPIC_AUTH_TOKEN: "provider-token"
    });
    expect(actual.env).not.toHaveProperty("0");
  });

  it("buildClaudeUseArgs injects default setting-sources when absent", () => {
    const actual = buildClaudeUseArgs("/tmp/runtime.json", ["--verbose"]);

    expect(actual).toEqual([
      "--setting-sources",
      "project,local",
      "--settings",
      "/tmp/runtime.json",
      "--verbose"
    ]);
  });

  it("buildClaudeUseArgs respects explicit --setting-sources", () => {
    const explicitLong = buildClaudeUseArgs("/tmp/runtime.json", [
      "--setting-sources",
      "user",
      "--verbose"
    ]);
    expect(explicitLong).toEqual([
      "--settings",
      "/tmp/runtime.json",
      "--setting-sources",
      "user",
      "--verbose"
    ]);

    const explicitEquals = buildClaudeUseArgs("/tmp/runtime.json", [
      "--setting-sources=user",
      "--verbose"
    ]);
    expect(explicitEquals).toEqual([
      "--settings",
      "/tmp/runtime.json",
      "--setting-sources=user",
      "--verbose"
    ]);
  });
});
