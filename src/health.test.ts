import { describe, expect, test } from "bun:test";
import type { Abi } from "viem";
import { runStartupHealthChecks } from "./health.ts";

const config = {
  etherscanApiKey: "etherscan-key",
  telegram: {
    botToken: "123456:test-token",
    chatId: "-1001234567890",
  },
};

describe("runStartupHealthChecks", () => {
  test("validates RPC, Etherscan API, and Telegram push", async () => {
    const telegramMessages: string[] = [];

    const result = await runStartupHealthChecks({
      client: {
        async getChainId() {
          return 1;
        },
        async getBlockNumber() {
          return 250n;
        },
      },
      config,
      dependencies: {
        async fetchContractAbi(_address, etherscanConfig) {
          expect(etherscanConfig.apiKey).toBe("etherscan-key");
          return [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }] as Abi;
        },
        async sendTelegramMessage(_telegramConfig, message) {
          telegramMessages.push(message.text);
        },
      },
    });

    expect(result.latestBlockNumber).toBe(250n);
    expect(telegramMessages).toEqual([
      "Onchain monitor startup check OK\nLatest Ethereum block: 250",
    ]);
  });

  test("fails when RPC is not Ethereum mainnet", async () => {
    await expect(
      runStartupHealthChecks({
        client: {
          async getChainId() {
            return 8453;
          },
          async getBlockNumber() {
            return 250n;
          },
        },
        config,
        dependencies: {
          async fetchContractAbi() {
            throw new Error("should not be called");
          },
          async sendTelegramMessage() {
            throw new Error("should not be called");
          },
        },
      }),
    ).rejects.toThrow("RPC check failed: expected chainId 1, got 8453");
  });

  test("fails when Etherscan does not return ABI", async () => {
    await expect(
      runStartupHealthChecks({
        client: {
          async getChainId() {
            return 1;
          },
          async getBlockNumber() {
            return 250n;
          },
        },
        config,
        dependencies: {
          async fetchContractAbi() {
            return undefined;
          },
          async sendTelegramMessage() {
            throw new Error("should not be called");
          },
        },
      }),
    ).rejects.toThrow("Etherscan API check failed: WETH ABI was not returned");
  });

  test("fails when Telegram push fails", async () => {
    await expect(
      runStartupHealthChecks({
        client: {
          async getChainId() {
            return 1;
          },
          async getBlockNumber() {
            return 250n;
          },
        },
        config,
        dependencies: {
          async fetchContractAbi() {
            return [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }] as Abi;
          },
          async sendTelegramMessage() {
            throw new Error("Telegram sendMessage failed: chat not found");
          },
        },
      }),
    ).rejects.toThrow("Telegram sendMessage failed: chat not found");
  });
});
