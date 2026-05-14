import { describe, expect, test } from "bun:test";
import { toFunctionSelector, type AbiFunction, type Address } from "viem";
import {
  buildAbiMethodSelectorMap,
  createEtherscanMethodResolver,
  fetchContractAbi,
  formatAbiFunctionName,
} from "./etherscan.ts";

const CONTRACT = "0x00000000000000000000000000000000000000aa" as Address;

describe("formatAbiFunctionName", () => {
  test("formats camelCase and PascalCase names like Etherscan labels", () => {
    expect(formatAbiFunctionName("mintPublic")).toBe("Mint Public");
    expect(formatAbiFunctionName("MintPublic")).toBe("Mint Public");
    expect(formatAbiFunctionName("safe_transfer_from")).toBe("Safe Transfer From");
  });
});

describe("buildAbiMethodSelectorMap", () => {
  test("builds selector to formatted function-name map from ABI", () => {
    const abiFunction = mintPublicAbiFunction();
    const selectorMap = buildAbiMethodSelectorMap([abiFunction]);

    expect(selectorMap.get(toFunctionSelector(abiFunction))).toBe("Mint Public");
  });
});

describe("fetchContractAbi", () => {
  test("fetches ABI from Etherscan V2 getabi endpoint", async () => {
    const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
      const parsedUrl = new URL(String(url));

      expect(parsedUrl.origin + parsedUrl.pathname).toBe("https://api.etherscan.io/v2/api");
      expect(parsedUrl.searchParams.get("chainid")).toBe("1");
      expect(parsedUrl.searchParams.get("module")).toBe("contract");
      expect(parsedUrl.searchParams.get("action")).toBe("getabi");
      expect(parsedUrl.searchParams.get("address")).toBe(CONTRACT);
      expect(parsedUrl.searchParams.get("apikey")).toBe("test-key");

      return Response.json({
        status: "1",
        message: "OK",
        result: JSON.stringify([
          {
            type: "function",
            name: "MintPublic",
            stateMutability: "payable",
            inputs: [],
            outputs: [],
          },
        ]),
      });
    };

    const abi = await fetchContractAbi(CONTRACT, { apiKey: "test-key" }, fetchImpl);

    expect(abi).toHaveLength(1);
  });

  test("returns undefined when the contract ABI is unavailable", async () => {
    const fetchImpl = async (): Promise<Response> =>
      Response.json({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      });

    await expect(fetchContractAbi(CONTRACT, { apiKey: "test-key" }, fetchImpl)).resolves.toBeUndefined();
  });
});

describe("createEtherscanMethodResolver", () => {
  test("resolves method names from fetched ABI and caches by contract", async () => {
    let fetchCount = 0;
    const fetchImpl = async (): Promise<Response> => {
      fetchCount += 1;
      return Response.json({
        status: "1",
        message: "OK",
        result: JSON.stringify([mintPublicAbiFunction()]),
      });
    };
    const resolveMethodName = createEtherscanMethodResolver({ apiKey: "test-key" }, fetchImpl);
    const selector = toFunctionSelector(mintPublicAbiFunction());

    await expect(resolveMethodName(CONTRACT, selector)).resolves.toEqual({
      methodSelector: selector,
      methodName: "Mint Public",
    });
    await expect(resolveMethodName(CONTRACT, selector)).resolves.toEqual({
      methodSelector: selector,
      methodName: "Mint Public",
    });
    expect(fetchCount).toBe(1);
  });

  test("falls back to selector labels when ABI has no match", async () => {
    const fetchImpl = async (): Promise<Response> =>
      Response.json({
        status: "1",
        message: "OK",
        result: JSON.stringify([]),
      });
    const resolveMethodName = createEtherscanMethodResolver({ apiKey: "test-key" }, fetchImpl);

    await expect(resolveMethodName(CONTRACT, "0x12345678")).resolves.toEqual({
      methodSelector: "0x12345678",
      methodName: "unknown(0x12345678)",
    });
  });
});

function mintPublicAbiFunction(): AbiFunction {
  return {
    type: "function",
    name: "MintPublic",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  };
}
