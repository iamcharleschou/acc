import { describe, expect, it } from "vitest";
import { expandLegacyArgs, normalizeControlArgs } from "../../src/cli/normalize.js";

describe("normalizeControlArgs", () => {
  it("normalizes command and control tokens, while preserving provider alias casing", () => {
    const actual = normalizeControlArgs(["PrOvIdEr", "AdD", "Claude", "YH"]);
    expect(actual).toEqual(["provider", "add", "cc", "YH"]);
  });

  it("normalizes codex agent id case-insensitively", () => {
    const actual = normalizeControlArgs(["use", "CoDeX", "my-alias"]);
    expect(actual).toEqual(["use", "codex", "my-alias"]);
  });
});

describe("expandLegacyArgs", () => {
  it("expands add/list/edit/remove legacy commands", () => {
    expect(expandLegacyArgs(["add", "YH"])).toEqual(["provider", "add", "cc", "YH"]);
    expect(expandLegacyArgs(["list"])).toEqual(["provider", "list", "cc"]);
    expect(expandLegacyArgs(["edit", "alpha"])).toEqual(["provider", "edit", "cc", "alpha"]);
    expect(expandLegacyArgs(["remove", "alpha"])).toEqual(["provider", "remove", "cc", "alpha"]);
  });

  it("expands legacy use when second arg is not explicit agent id", () => {
    expect(expandLegacyArgs(["use", "YH"])).toEqual(["use", "cc", "YH"]);
    expect(expandLegacyArgs(["use", "YH", "--force"])).toEqual(["use", "cc", "YH", "--force"]);
  });

  it("keeps explicit agent id for use", () => {
    expect(expandLegacyArgs(["use", "cc", "YH"])).toEqual(["use", "cc", "YH"]);
    expect(expandLegacyArgs(["use", "codex", "dev"])).toEqual(["use", "codex", "dev"]);
  });
});
