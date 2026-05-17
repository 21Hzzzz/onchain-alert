import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import type { AddressBook } from "./addressBook.ts";
import { DEFAULT_MINT_ROUTER_CONTRACTS, parseConfig, parseRuntimeConfig } from "./config.ts";

const ETH_RPC_HTTP_URL = "https://example.invalid/rpc";
const ETHERSCAN_API_KEY = "etherscan-api-key";
const TELEGRAM_BOT_TOKEN = "123456:telegram-token";
const TELEGRAM_CHAT_ID = "-1001234567890";
const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";
const ADDRESS_TWO = "0x0000000000000000000000000000000000000002";
const env = { ETH_RPC_HTTP_URL, ETHERSCAN_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID };

const addressBook: AddressBook = {
  watchedAddresses: [
    { address: getAddress(ADDRESS_ONE), remark: "wallet one" },
    { address: getAddress(ADDRESS_TWO) },
  ],
  blacklistedContracts: [{ address: getAddress(ADDRESS_TWO), remark: "contract two" }],
};

describe("parseRuntimeConfig", () => {
  test("parses runtime config and defaults addressBookPath", () => {
    const config = parseRuntimeConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 2,
        pollIntervalMs: 12000,
      },
      env,
    );

    expect(config.rpcUrl).toBe(ETH_RPC_HTTP_URL);
    expect(config.etherscanApiKey).toBe(ETHERSCAN_API_KEY);
    expect(config.telegramBotToken).toBe(TELEGRAM_BOT_TOKEN);
    expect(config.telegramChatId).toBe(TELEGRAM_CHAT_ID);
    expect(config.windowSeconds).toBe(300);
    expect(config.addressBookPath).toBe("addresses.txt");
    expect(config.blacklistedMethods).toEqual([]);
    expect(config.mintRouterContracts).toEqual(DEFAULT_MINT_ROUTER_CONTRACTS);
  });

  test("accepts a custom addressBookPath", () => {
    const config = parseRuntimeConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 1,
        pollIntervalMs: 12000,
        addressBookPath: "lists/mainnet-addresses.txt",
      },
      env,
    );

    expect(config.addressBookPath).toBe("lists/mainnet-addresses.txt");
  });

  test("accepts method blacklists", () => {
    const config = parseRuntimeConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 1,
        pollIntervalMs: 12000,
        blacklistedMethods: [" setApprovalForAll ", "0xa22cb465"],
      },
      env,
    );

    expect(config.blacklistedMethods).toEqual(["setApprovalForAll", "0xa22cb465"]);
  });

  test("allows disabling default mint router contracts", () => {
    const config = parseRuntimeConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 1,
        pollIntervalMs: 12000,
        mintRouterContracts: [],
      },
      env,
    );

    expect(config.mintRouterContracts).toEqual([]);
  });

  test("accepts custom mint router contracts", () => {
    const config = parseRuntimeConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 1,
        pollIntervalMs: 12000,
        mintRouterContracts: [" 0x00000000000000000000000000000000000000aa "],
      },
      env,
    );

    expect(config.mintRouterContracts).toEqual([
      getAddress("0x00000000000000000000000000000000000000aa"),
    ]);
  });

  test("requires ETH_RPC_HTTP_URL", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
        },
        {},
      ),
    ).toThrow("ETH_RPC_HTTP_URL is required");
  });

  test("requires ETHERSCAN_API_KEY", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
        },
        { ETH_RPC_HTTP_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID },
      ),
    ).toThrow("ETHERSCAN_API_KEY is required");
  });

  test("requires TELEGRAM_BOT_TOKEN", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
        },
        { ETH_RPC_HTTP_URL, ETHERSCAN_API_KEY, TELEGRAM_CHAT_ID },
      ),
    ).toThrow("TELEGRAM_BOT_TOKEN is required");
  });

  test("requires TELEGRAM_CHAT_ID", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
        },
        { ETH_RPC_HTTP_URL, ETHERSCAN_API_KEY, TELEGRAM_BOT_TOKEN },
      ),
    ).toThrow("TELEGRAM_CHAT_ID is required");
  });

  test("rejects moved address fields in config.json", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
          watchedAddresses: [ADDRESS_ONE],
        },
        env,
      ),
    ).toThrow(
      "watchedAddresses and blacklistedContracts must be configured in addressBookPath, not config.json",
    );
  });

  test("rejects invalid numeric thresholds", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 0,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
        },
        env,
      ),
    ).toThrow("windowMinutes must be a positive number");
  });

  test("rejects invalid method blacklists", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
          blacklistedMethods: ["setApprovalForAll", ""],
        },
        env,
      ),
    ).toThrow("blacklistedMethods[1] must be a non-empty string");
  });

  test("rejects invalid mint router contracts", () => {
    expect(() =>
      parseRuntimeConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 1,
          pollIntervalMs: 12000,
          mintRouterContracts: ["not-an-address"],
        },
        env,
      ),
    ).toThrow("mintRouterContracts[0] must be a valid Ethereum address");
  });
});

describe("parseConfig", () => {
  test("builds monitor config from runtime config and address book", () => {
    const config = parseConfig(
      {
        windowMinutes: 5,
        minUniqueAddresses: 2,
        pollIntervalMs: 12000,
      },
      env,
      addressBook,
    );

    expect(config.watchedAddresses).toEqual(addressBook.watchedAddresses);
    expect(config.blacklistedContracts).toEqual(addressBook.blacklistedContracts);
    expect(config.blacklistedMethods).toEqual([]);
    expect(config.mintRouterContracts).toEqual(DEFAULT_MINT_ROUTER_CONTRACTS);
  });

  test("rejects impossible unique-address thresholds", () => {
    expect(() =>
      parseConfig(
        {
          windowMinutes: 5,
          minUniqueAddresses: 3,
          pollIntervalMs: 12000,
        },
        env,
        addressBook,
      ),
    ).toThrow("minUniqueAddresses cannot exceed watchedAddresses unique count");
  });
});
