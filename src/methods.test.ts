import { describe, expect, test } from "bun:test";
import {
  buildMethodBlacklist,
  extractMethodSelector,
  isMethodBlacklisted,
  methodNameForInput,
} from "./methods.ts";

describe("extractMethodSelector", () => {
  test("extracts the four-byte selector", () => {
    expect(
      extractMethodSelector(
        "0x40c10f190000000000000000000000000000000000000000000000000000000000000001",
      ),
    ).toBe("0x40c10f19");
  });

  test("returns undefined for fallback or receive calls", () => {
    expect(extractMethodSelector("0x")).toBeUndefined();
  });
});

describe("methodNameForInput", () => {
  test("returns known method names", () => {
    expect(
      methodNameForInput(
        "0x095ea7b30000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toBe("approve");
    expect(
      methodNameForInput(
        "0xa22cb4650000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toBe("setApprovalForAll");
  });

  test("falls back to unknown(selector)", () => {
    expect(methodNameForInput("0x1234567800000000")).toBe("unknown(0x12345678)");
  });

  test("labels empty calldata as fallback/receive", () => {
    expect(methodNameForInput("0x")).toBe("fallback/receive");
  });
});

describe("method blacklist", () => {
  test("matches method names case-insensitively", () => {
    const blacklist = buildMethodBlacklist([" setApprovalForAll "]);

    expect(
      isMethodBlacklisted(
        {
          methodSelector: "0xa22cb465",
          methodName: "setApprovalForAll",
        },
        blacklist,
      ),
    ).toBe(true);
  });

  test("matches method selectors", () => {
    const blacklist = buildMethodBlacklist(["0xa22cb465", "0x42842e0e", "0xb88d4fde"]);

    expect(
      isMethodBlacklisted(
        {
          methodSelector: "0xa22cb465",
          methodName: "unknown(0xa22cb465)",
        },
        blacklist,
      ),
    ).toBe(true);
    expect(
      isMethodBlacklisted(
        {
          methodSelector: "0x42842e0e",
          methodName: "safeTransferFrom",
        },
        blacklist,
      ),
    ).toBe(true);
    expect(
      isMethodBlacklisted(
        {
          methodSelector: "0xb88d4fde",
          methodName: "safeTransferFrom",
        },
        blacklist,
      ),
    ).toBe(true);
  });
});
