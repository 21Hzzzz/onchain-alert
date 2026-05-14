import { describe, expect, test } from "bun:test";
import { extractMethodSelector, methodNameForInput } from "./methods.ts";

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
  });

  test("falls back to unknown(selector)", () => {
    expect(methodNameForInput("0x1234567800000000")).toBe("unknown(0x12345678)");
  });

  test("labels empty calldata as fallback/receive", () => {
    expect(methodNameForInput("0x")).toBe("fallback/receive");
  });
});
