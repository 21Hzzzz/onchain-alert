import { getAddress, isAddress, type Address } from "viem";

export type AddressLike = Address | { address: Address };

export function addressKey(address: string): string {
  return address.toLowerCase();
}

export function normalizeAddress(value: unknown, fieldName: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${fieldName} must be a valid Ethereum address`);
  }

  return getAddress(value);
}

export function buildWatchedAddressSet(addresses: readonly AddressLike[]): ReadonlySet<string> {
  return new Set(addresses.map((entry) => addressKey(addressFromEntry(entry))));
}

export function addressFromEntry(entry: AddressLike): Address {
  return typeof entry === "string" ? entry : entry.address;
}
