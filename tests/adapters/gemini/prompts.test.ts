import { beforeEach, describe, expect, it, vi } from "vitest";

const { inputMock, passwordMock, confirmMock, selectMock, checkboxMock } = vi.hoisted(() => ({
  inputMock: vi.fn(),
  passwordMock: vi.fn(),
  confirmMock: vi.fn(),
  selectMock: vi.fn(),
  checkboxMock: vi.fn()
}));

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
  password: passwordMock,
  confirm: confirmMock,
  select: selectMock,
  checkbox: checkboxMock
}));

import {
  promptGeminiProviderAdd,
  promptGeminiProviderEdit
} from "../../../src/adapters/gemini/prompts.js";

describe("gemini prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects required and optional Gemini fields plus extra env vars in add flow", async () => {
    inputMock
      .mockResolvedValueOnce("official")
      .mockResolvedValueOnce("https://generativelanguage.googleapis.com")
      .mockResolvedValueOnce("gemini-2.5-pro")
      .mockResolvedValueOnce("HTTPS_PROXY")
      .mockResolvedValueOnce("http://127.0.0.1:7890");
    passwordMock.mockResolvedValueOnce("secret");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await promptGeminiProviderAdd();

    expect(result).toEqual({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret",
        GOOGLE_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
        GEMINI_MODEL: "gemini-2.5-pro",
        HTTPS_PROXY: "http://127.0.0.1:7890"
      }
    });
  });

  it("omits optional Gemini fields in add flow when blank", async () => {
    inputMock
      .mockResolvedValueOnce("official")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("");
    passwordMock.mockResolvedValueOnce("secret");
    confirmMock.mockResolvedValueOnce(false);

    const result = await promptGeminiProviderAdd();

    expect(result).toEqual({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret"
      }
    });
  });

  it("rejects invalid extra env key format in add flow validator", async () => {
    inputMock
      .mockResolvedValueOnce("official")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("HTTP_PROXY")
      .mockResolvedValueOnce("http://127.0.0.1:7890");
    passwordMock.mockResolvedValueOnce("secret");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await promptGeminiProviderAdd();

    const extraKeyCall = inputMock.mock.calls.find(
      ([options]) => options?.message === "额外环境变量 Key:"
    );
    const validator = extraKeyCall?.[0]?.validate as ((value: string) => true | string) | undefined;
    expect(typeof validator).toBe("function");
    expect(validator?.("BAD-KEY\nNEXT")).toBeTypeOf("string");
    expect(validator?.("NO_PROXY")).toBe(true);
  });

  it("supports edit mode for existing env fields", async () => {
    selectMock.mockResolvedValueOnce("edit").mockResolvedValueOnce("GEMINI_MODEL");
    inputMock.mockResolvedValueOnce("gemini-2.5-flash");

    const result = await promptGeminiProviderEdit({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret",
        GEMINI_MODEL: "gemini-2.5-pro"
      }
    });

    expect(result).toEqual({
      mode: "edit",
      key: "GEMINI_MODEL",
      value: "gemini-2.5-flash"
    });
  });

  it("supports add mode for new env fields", async () => {
    selectMock.mockResolvedValueOnce("add");
    inputMock.mockResolvedValueOnce("HTTP_PROXY").mockResolvedValueOnce("http://127.0.0.1:7890");

    const result = await promptGeminiProviderEdit({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret"
      }
    });

    expect(result).toEqual({
      mode: "add",
      key: "HTTP_PROXY",
      value: "http://127.0.0.1:7890"
    });
  });

  it("delete mode excludes GEMINI_API_KEY from selectable choices", async () => {
    selectMock.mockResolvedValueOnce("delete");
    checkboxMock.mockResolvedValueOnce(["GOOGLE_GEMINI_BASE_URL"]);
    confirmMock.mockResolvedValueOnce(true);

    const result = await promptGeminiProviderEdit({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret",
        GOOGLE_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
        GEMINI_MODEL: "gemini-2.5-pro"
      }
    });

    expect(result).toEqual({
      mode: "delete",
      keys: ["GOOGLE_GEMINI_BASE_URL"]
    });
    const choices = checkboxMock.mock.calls[0]?.[0]?.choices as Array<{ value: string }>;
    expect(choices.map((choice) => choice.value)).not.toContain("GEMINI_API_KEY");
  });

  it("delete mode returns empty keys when only GEMINI_API_KEY exists", async () => {
    selectMock.mockResolvedValueOnce("delete");

    const result = await promptGeminiProviderEdit({
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret"
      }
    });

    expect(result).toEqual({
      mode: "delete",
      keys: []
    });
    expect(checkboxMock).not.toHaveBeenCalled();
  });
});
