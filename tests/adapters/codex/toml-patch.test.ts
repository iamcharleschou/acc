import { describe, expect, it } from "vitest";
import { setModelProvider, upsertModelProviderBlock } from "../../../src/adapters/codex/toml-patch.js";

describe("setModelProvider", () => {
  it("replaces active top-level model_provider without clobbering other settings", () => {
    const source = `log_level = "debug"
model_provider = "old"
max_retries = 3

[model_providers.old]
name = "legacy"
`;

    const patched = setModelProvider(source, "dev");

    expect(patched).toContain(`model_provider = "dev"`);
    expect(patched).not.toContain(`model_provider = "old"`);
    expect(patched).toContain(`log_level = "debug"`);
    expect(patched).toContain("max_retries = 3");
    expect(patched).toContain("[model_providers.old]");
  });

  it("keeps inline-comment table headers untouched when replacing top-level provider", () => {
    const source = `model_provider = "old"
timeout = 30

[profile.default] # keep this comment
mode = "safe"
`;

    const patched = setModelProvider(source, "dev");

    expect(patched).toContain(`model_provider = "dev"`);
    expect(patched).toContain(`[profile.default] # keep this comment`);
    expect(patched).toContain(`mode = "safe"`);
  });

  it("does not treat nested model_provider under quoted header as top-level", () => {
    const source = `model_provider = "old"

[profile."a]b"]
model_provider = "nested"
mode = "safe"
`;

    const patched = setModelProvider(source, "dev");

    expect(patched).toContain(`model_provider = "dev"`);
    expect(patched).toContain(`[profile."a]b"]`);
    expect(patched).toContain(`model_provider = "nested"`);
    expect(patched.match(/model_provider =/g)?.length).toBe(2);
  });
});

describe("upsertModelProviderBlock", () => {
  it("inserts provider block when missing", () => {
    const source = `model_provider = "default"`;
    const patched = upsertModelProviderBlock(source, "dev", {
      name: "openai",
      baseUrl: "https://proxy.example.com/v1",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    expect(patched).toContain("[model_providers.dev]");
    expect(patched).toContain(`name = "openai"`);
    expect(patched).toContain(`base_url = "https://proxy.example.com/v1"`);
    expect(patched).toContain(`wire_api = "responses"`);
    expect(patched).toContain("requires_openai_auth = true");
  });

  it("replaces existing provider block and keeps unrelated blocks", () => {
    const source = `model_provider = "dev"

[model_providers.dev]
name = "old"
base_url = "https://old.example.com/v1"
wire_api = "responses"
requires_openai_auth = false

[model_providers.keep]
name = "keep"
base_url = "https://keep.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
`;
    const patched = upsertModelProviderBlock(source, "dev", {
      name: "openai",
      baseUrl: "https://new.example.com/v1",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    expect(patched).toContain(`name = "openai"`);
    expect(patched).toContain(`base_url = "https://new.example.com/v1"`);
    expect(patched).toContain("requires_openai_auth = true");
    expect(patched).not.toContain(`base_url = "https://old.example.com/v1"`);
    expect(patched).toContain("[model_providers.keep]");
    expect(patched).toContain(`base_url = "https://keep.example.com/v1"`);
  });

  it("replaces provider block even when header has inline comment", () => {
    const source = `model_provider = "dev"

[model_providers.dev] # current provider
name = "old"
base_url = "https://old.example.com/v1"
wire_api = "responses"
requires_openai_auth = false

[other]
value = "x"
`;
    const patched = upsertModelProviderBlock(source, "dev", {
      name: "openai",
      baseUrl: "https://new.example.com/v1",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    expect(patched.match(/\[model_providers\.dev\]/g)?.length).toBe(1);
    expect(patched).toContain(`base_url = "https://new.example.com/v1"`);
    expect(patched).toContain(`[other]`);
    expect(patched).toContain(`value = "x"`);
  });

  it("stops replacement at [[array_of_tables]] boundary", () => {
    const source = `model_provider = "dev"

[model_providers.dev]
name = "old"
base_url = "https://old.example.com/v1"
wire_api = "responses"
requires_openai_auth = false

[[plugins]]
name = "first"

[after]
value = 1
`;
    const patched = upsertModelProviderBlock(source, "dev", {
      name: "openai",
      baseUrl: "https://new.example.com/v1",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    expect(patched).toContain("[[plugins]]");
    expect(patched).toContain(`name = "first"`);
    expect(patched).toContain(`[after]`);
    expect(patched).toContain(`value = 1`);
  });

  it("does not swallow sections when quoted header contains closing bracket", () => {
    const source = `model_provider = "dev"

[model_providers.dev]
name = "old"
base_url = "https://old.example.com/v1"
wire_api = "responses"
requires_openai_auth = false

[profile."a]b"]
model_provider = "nested"

[after]
value = 2
`;
    const patched = upsertModelProviderBlock(source, "dev", {
      name: "openai",
      baseUrl: "https://new.example.com/v1",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    expect(patched).toContain(`[profile."a]b"]`);
    expect(patched).toContain(`model_provider = "nested"`);
    expect(patched).toContain(`[after]`);
    expect(patched).toContain("value = 2");
  });
});
