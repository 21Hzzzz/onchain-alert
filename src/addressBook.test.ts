import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import { buildAddressRemarkMap, parseAddressBook } from "./addressBook.ts";
import { addressKey } from "./address.ts";

const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";
const ADDRESS_TWO = "0x0000000000000000000000000000000000000002";
const CONTRACT_ONE = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

describe("parseAddressBook", () => {
  test("parses remarks, empty lines, comments, and optional remarks", () => {
    const addressBook = parseAddressBook(
      `
# watched wallets
[watchedAddresses]
${ADDRESS_ONE},团队钱包 A

${ADDRESS_TWO}

[blacklistedContracts]
${CONTRACT_ONE},USDT, Tether
`,
      "addresses.txt",
    );

    expect(addressBook.watchedAddresses).toEqual([
      { address: getAddress(ADDRESS_ONE), remark: "团队钱包 A" },
      { address: getAddress(ADDRESS_TWO) },
    ]);
    expect(addressBook.blacklistedContracts).toEqual([
      { address: getAddress(CONTRACT_ONE), remark: "USDT, Tether" },
    ]);
  });

  test("deduplicates by address and lets later remarks win", () => {
    const addressBook = parseAddressBook(
      `
[watchedAddresses]
${ADDRESS_ONE},old
${ADDRESS_ONE},new

[blacklistedContracts]
`,
      "addresses.txt",
    );

    expect(addressBook.watchedAddresses).toEqual([
      { address: getAddress(ADDRESS_ONE), remark: "new" },
    ]);
  });

  test("rejects unknown sections", () => {
    expect(() =>
      parseAddressBook(
        `
[watchedAddresses]
${ADDRESS_ONE}
[other]
${ADDRESS_TWO}
[blacklistedContracts]
`,
        "addresses.txt",
      ),
    ).toThrow("addresses.txt:4: unknown section [other]");
  });

  test("rejects missing required sections", () => {
    expect(() =>
      parseAddressBook(
        `
[watchedAddresses]
${ADDRESS_ONE}
`,
        "addresses.txt",
      ),
    ).toThrow("addresses.txt: missing [blacklistedContracts] section");
  });

  test("rejects invalid addresses", () => {
    expect(() =>
      parseAddressBook(
        `
[watchedAddresses]
not-an-address
[blacklistedContracts]
`,
        "addresses.txt",
      ),
    ).toThrow("addresses.txt:3 address must be a valid Ethereum address");
  });

  test("rejects empty watched address section", () => {
    expect(() =>
      parseAddressBook(
        `
[watchedAddresses]
[blacklistedContracts]
`,
        "addresses.txt",
      ),
    ).toThrow("addresses.txt: watchedAddresses must contain at least one address");
  });
});

describe("buildAddressRemarkMap", () => {
  test("indexes only entries that have remarks", () => {
    const remarks = buildAddressRemarkMap([
      { address: getAddress(ADDRESS_ONE), remark: "wallet one" },
      { address: getAddress(ADDRESS_TWO) },
    ]);

    expect(remarks.get(addressKey(ADDRESS_ONE))).toBe("wallet one");
    expect(remarks.has(addressKey(ADDRESS_TWO))).toBe(false);
  });
});
