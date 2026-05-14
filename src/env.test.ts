import { describe, expect, test } from "bun:test";
import { mergeEnvFiles, parseDotEnv } from "./env.ts";

describe("parseDotEnv", () => {
  test("parses key-value pairs, comments, export prefixes, and quoted values", () => {
    expect(
      parseDotEnv(`
# comment
ETH_RPC_HTTP_URL=https://example.invalid/rpc
export SECOND_VALUE="quoted value"
THIRD_VALUE='single quoted'
`),
    ).toEqual({
      ETH_RPC_HTTP_URL: "https://example.invalid/rpc",
      SECOND_VALUE: "quoted value",
      THIRD_VALUE: "single quoted",
    });
  });

  test("rejects invalid lines", () => {
    expect(() => parseDotEnv("ETH_RPC_HTTP_URL")).toThrow(".env:1: expected KEY=value");
  });

  test("rejects invalid variable names", () => {
    expect(() => parseDotEnv("1_BAD=value")).toThrow(
      ".env:1: invalid environment variable name",
    );
  });
});

describe("mergeEnvFiles", () => {
  test("lets runtime environment variables override .env values", () => {
    expect(
      mergeEnvFiles(
        { ETH_RPC_HTTP_URL: "https://from-dot-env.invalid" },
        { ETH_RPC_HTTP_URL: "https://from-runtime.invalid" },
      ).ETH_RPC_HTTP_URL,
    ).toBe("https://from-runtime.invalid");
  });
});
