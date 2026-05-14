import {
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { addressKey } from "./address.ts";
import {
  defaultMethodNameResolver,
  extractMethodSelector,
  type MethodNameResolver,
} from "./methods.ts";

export type EtherscanConfig = {
  apiKey: string;
  chainId?: number;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type EtherscanAbiResponse = {
  status: string;
  message: string;
  result: string;
};

const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";

export function createEtherscanMethodResolver(
  config: EtherscanConfig,
  fetchImpl: FetchLike = fetch,
): MethodNameResolver {
  const selectorMapCache = new Map<string, Promise<ReadonlyMap<string, string> | undefined>>();

  return async (contractAddress, input) => {
    const methodSelector = extractMethodSelector(input);
    if (methodSelector === undefined) {
      return defaultMethodNameResolver(contractAddress, input);
    }

    try {
      const selectorMap = await selectorMapForContract(
        contractAddress,
        config,
        selectorMapCache,
        fetchImpl,
      );
      const abiMethodName = selectorMap?.get(methodSelector);

      if (abiMethodName !== undefined) {
        return {
          methodSelector,
          methodName: abiMethodName,
        };
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }

    return defaultMethodNameResolver(contractAddress, input);
  };
}

export async function fetchContractAbi(
  address: Address,
  config: EtherscanConfig,
  fetchImpl: FetchLike = fetch,
): Promise<Abi | undefined> {
  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set("chainid", String(config.chainId ?? 1));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getabi");
  url.searchParams.set("address", address);
  url.searchParams.set("apikey", config.apiKey);

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Etherscan getabi failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as EtherscanAbiResponse;
  if (payload.status !== "1") {
    if (payload.result.toLowerCase().includes("source code not verified")) {
      return undefined;
    }

    throw new Error(`Etherscan getabi failed: ${payload.message}: ${payload.result}`);
  }

  const parsedAbi = JSON.parse(payload.result) as unknown;
  if (!Array.isArray(parsedAbi)) {
    return undefined;
  }

  return parsedAbi as Abi;
}

export function buildAbiMethodSelectorMap(abi: Abi): ReadonlyMap<string, string> {
  const selectorMap = new Map<string, string>();

  for (const item of abi) {
    if (item.type !== "function") {
      continue;
    }

    const functionItem = item as AbiFunction;
    selectorMap.set(toFunctionSelector(functionItem).toLowerCase(), formatAbiFunctionName(functionItem.name));
  }

  return selectorMap;
}

export function formatAbiFunctionName(name: string): string {
  return name
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function selectorMapForContract(
  contractAddress: Address,
  config: EtherscanConfig,
  selectorMapCache: Map<string, Promise<ReadonlyMap<string, string> | undefined>>,
  fetchImpl: FetchLike,
): Promise<ReadonlyMap<string, string> | undefined> {
  const key = addressKey(contractAddress);
  const cached = selectorMapCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const promise = fetchContractAbi(contractAddress, config, fetchImpl)
    .then((abi) => (abi === undefined ? undefined : buildAbiMethodSelectorMap(abi)))
    .catch((error) => {
      selectorMapCache.delete(key);
      throw error;
    });
  selectorMapCache.set(key, promise);
  return promise;
}
