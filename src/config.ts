import type { Address } from "viem";
import { dirname, isAbsolute, resolve } from "node:path";
import { normalizeAddress } from "./address.ts";
import type { AddressBook, AddressEntry } from "./addressBook.ts";
import { loadAddressBook } from "./addressBook.ts";
import { loadDotEnvFile, mergeEnvFiles } from "./env.ts";

export const DEFAULT_MINT_ROUTER_CONTRACTS = [
  "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",
] as const satisfies readonly Address[];
export const DEFAULT_ALERT_COOLDOWN_MINUTES = 30;

export type MonitorConfig = {
  rpcUrl: string;
  etherscanApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  windowMinutes: number;
  windowSeconds: number;
  alertCooldownMinutes: number;
  alertCooldownSeconds: number;
  minUniqueAddresses: number;
  pollIntervalMs: number;
  addressBookPath: string;
  blacklistedMethods: readonly string[];
  mintRouterContracts: readonly Address[];
  blacklistedContracts: readonly AddressEntry[];
  watchedAddresses: readonly AddressEntry[];
};

type RawConfig = Record<string, unknown>;
type RuntimeConfig = Omit<MonitorConfig, "blacklistedContracts" | "watchedAddresses">;

export async function loadConfig(configPath = "config.json"): Promise<MonitorConfig> {
  let rawText: string;

  try {
    rawText = await Bun.file(configPath).text();
  } catch (error) {
    throw new Error(`Failed to read ${configPath}: ${formatError(error)}`);
  }

  let rawConfig: unknown;

  try {
    rawConfig = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${formatError(error)}`);
  }

  const runtimeConfig = parseRuntimeConfig(rawConfig, mergeEnvFiles(await loadDotEnvFile(), Bun.env));
  const addressBookPath = resolveAddressBookPath(configPath, runtimeConfig.addressBookPath);
  const addressBook = await loadAddressBook(addressBookPath);

  return buildMonitorConfig(
    {
      ...runtimeConfig,
      addressBookPath,
    },
    addressBook,
  );
}

export function parseConfig(
  rawConfig: unknown,
  env: Record<string, string | undefined>,
  addressBook: AddressBook,
): MonitorConfig {
  return buildMonitorConfig(parseRuntimeConfig(rawConfig, env), addressBook);
}

export function parseRuntimeConfig(
  rawConfig: unknown,
  env: Record<string, string | undefined>,
): RuntimeConfig {
  if (!isRecord(rawConfig)) {
    throw new Error("config.json must contain a JSON object");
  }

  rejectMovedAddressFields(rawConfig);

  const rpcUrl = env.ETH_RPC_HTTP_URL?.trim();
  if (!rpcUrl) {
    throw new Error("ETH_RPC_HTTP_URL is required");
  }
  const etherscanApiKey = env.ETHERSCAN_API_KEY?.trim();
  if (!etherscanApiKey) {
    throw new Error("ETHERSCAN_API_KEY is required");
  }
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  const telegramChatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!telegramChatId) {
    throw new Error("TELEGRAM_CHAT_ID is required");
  }

  const windowMinutes = parsePositiveNumber(rawConfig, "windowMinutes");
  const alertCooldownMinutes =
    parseOptionalPositiveNumber(rawConfig, "alertCooldownMinutes") ??
    DEFAULT_ALERT_COOLDOWN_MINUTES;
  const minUniqueAddresses = parsePositiveInteger(rawConfig, "minUniqueAddresses");
  const pollIntervalMs = parsePositiveInteger(rawConfig, "pollIntervalMs");
  const addressBookPath = parseOptionalString(rawConfig, "addressBookPath") ?? "addresses.txt";
  const blacklistedMethods = parseOptionalStringArray(rawConfig, "blacklistedMethods") ?? [];
  const mintRouterContracts =
    parseOptionalAddressArray(rawConfig, "mintRouterContracts") ?? DEFAULT_MINT_ROUTER_CONTRACTS;

  return {
    rpcUrl,
    etherscanApiKey,
    telegramBotToken,
    telegramChatId,
    windowMinutes,
    windowSeconds: windowMinutes * 60,
    alertCooldownMinutes,
    alertCooldownSeconds: alertCooldownMinutes * 60,
    minUniqueAddresses,
    pollIntervalMs,
    addressBookPath,
    blacklistedMethods,
    mintRouterContracts,
  };
}

export function buildMonitorConfig(
  runtimeConfig: RuntimeConfig,
  addressBook: AddressBook,
): MonitorConfig {
  if (runtimeConfig.minUniqueAddresses > addressBook.watchedAddresses.length) {
    throw new Error("minUniqueAddresses cannot exceed watchedAddresses unique count");
  }

  return {
    ...runtimeConfig,
    watchedAddresses: addressBook.watchedAddresses,
    blacklistedContracts: addressBook.blacklistedContracts,
  };
}

function parsePositiveNumber(rawConfig: RawConfig, fieldName: string): number {
  const value = rawConfig[fieldName];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }

  return value;
}

function parseOptionalPositiveNumber(rawConfig: RawConfig, fieldName: string): number | undefined {
  if (rawConfig[fieldName] === undefined) {
    return undefined;
  }

  return parsePositiveNumber(rawConfig, fieldName);
}

function parsePositiveInteger(rawConfig: RawConfig, fieldName: string): number {
  const value = parsePositiveNumber(rawConfig, fieldName);
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return value;
}

function parseOptionalString(rawConfig: RawConfig, fieldName: string): string | undefined {
  const value = rawConfig[fieldName];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function parseOptionalStringArray(
  rawConfig: RawConfig,
  fieldName: string,
): readonly string[] | undefined {
  const value = rawConfig[fieldName];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new Error(`${fieldName}[${index}] must be a non-empty string`);
    }

    return entry.trim();
  });
}

function parseOptionalAddressArray(
  rawConfig: RawConfig,
  fieldName: string,
): readonly Address[] | undefined {
  const value = rawConfig[fieldName];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of Ethereum addresses`);
  }

  return value.map((entry, index) =>
    normalizeAddress(typeof entry === "string" ? entry.trim() : entry, `${fieldName}[${index}]`),
  );
}

function rejectMovedAddressFields(rawConfig: RawConfig): void {
  if ("watchedAddresses" in rawConfig || "blacklistedContracts" in rawConfig) {
    throw new Error(
      "watchedAddresses and blacklistedContracts must be configured in addressBookPath, not config.json",
    );
  }
}

function resolveAddressBookPath(configPath: string, addressBookPath: string): string {
  if (isAbsolute(addressBookPath)) {
    return addressBookPath;
  }

  return resolve(dirname(configPath), addressBookPath);
}

function isRecord(value: unknown): value is RawConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
