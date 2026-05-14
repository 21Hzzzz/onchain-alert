import type { Address, Hex } from "viem";

export type MethodNameResult = {
  methodSelector?: Hex;
  methodName: string;
};

export type MethodNameResolver = (
  contractAddress: Address,
  input: Hex,
) => Promise<MethodNameResult>;

const KNOWN_METHODS = new Map<string, string>([
  ["0xa9059cbb", "transfer"],
  ["0x095ea7b3", "approve"],
  ["0x23b872dd", "transferFrom"],
  ["0x40c10f19", "mint"],
  ["0x1249c58b", "mint"],
  ["0x42842e0e", "safeTransferFrom"],
  ["0xb88d4fde", "safeTransferFrom"],
  ["0x38ed1739", "swapExactTokensForTokens"],
  ["0x7ff36ab5", "swapExactETHForTokens"],
  ["0x18cbafe5", "swapExactTokensForETH"],
  ["0xfb3bdb41", "swapETHForExactTokens"],
  ["0x8803dbee", "swapTokensForExactTokens"],
  ["0x4a25d94a", "swapTokensForExactETH"],
  ["0x5ae401dc", "multicall"],
  ["0xac9650d8", "multicall"],
  ["0x3593564c", "execute"],
  ["0xb858183f", "execute"],
]);

export function extractMethodSelector(input: Hex): Hex | undefined {
  if (!/^0x[0-9a-fA-F]*$/.test(input) || input.length < 10) {
    return undefined;
  }

  return input.slice(0, 10).toLowerCase() as Hex;
}

export function methodNameForInput(input: Hex): string {
  const selector = extractMethodSelector(input);
  if (selector === undefined) {
    return "fallback/receive";
  }

  return KNOWN_METHODS.get(selector) ?? `unknown(${selector})`;
}

export async function defaultMethodNameResolver(
  _contractAddress: Address,
  input: Hex,
): Promise<MethodNameResult> {
  return {
    methodSelector: extractMethodSelector(input),
    methodName: methodNameForInput(input),
  };
}
