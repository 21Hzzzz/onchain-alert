import type { Address } from "viem";
import { addressKey, normalizeAddress } from "./address.ts";

export type AddressEntry = {
  address: Address;
  remark?: string;
};

export type AddressBook = {
  watchedAddresses: readonly AddressEntry[];
  blacklistedContracts: readonly AddressEntry[];
};

type SectionName = keyof AddressBook;

const SECTION_NAMES = new Set<SectionName>(["watchedAddresses", "blacklistedContracts"]);

export async function loadAddressBook(addressBookPath: string): Promise<AddressBook> {
  let rawText: string;

  try {
    rawText = await Bun.file(addressBookPath).text();
  } catch (error) {
    throw new Error(`Failed to read ${addressBookPath}: ${formatError(error)}`);
  }

  return parseAddressBook(rawText, addressBookPath);
}

export function parseAddressBook(rawText: string, sourceName = "addresses.txt"): AddressBook {
  const sections: Record<SectionName, Map<string, AddressEntry>> = {
    watchedAddresses: new Map(),
    blacklistedContracts: new Map(),
  };
  const seenSections = new Set<SectionName>();
  let currentSection: SectionName | undefined;

  rawText.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      return;
    }

    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const sectionName = trimmedLine.slice(1, -1).trim();
      if (!isSectionName(sectionName)) {
        throw new Error(`${sourceName}:${lineNumber}: unknown section [${sectionName}]`);
      }

      currentSection = sectionName;
      seenSections.add(sectionName);
      return;
    }

    if (currentSection === undefined) {
      throw new Error(`${sourceName}:${lineNumber}: address line must appear inside a section`);
    }

    const entry = parseAddressLine(trimmedLine, sourceName, lineNumber);
    const entries = sections[currentSection];
    const key = addressKey(entry.address);
    entries.delete(key);
    entries.set(key, entry);
  });

  requireSection(seenSections, "watchedAddresses", sourceName);
  requireSection(seenSections, "blacklistedContracts", sourceName);

  const watchedAddresses = Array.from(sections.watchedAddresses.values());
  if (watchedAddresses.length === 0) {
    throw new Error(`${sourceName}: watchedAddresses must contain at least one address`);
  }

  return {
    watchedAddresses,
    blacklistedContracts: Array.from(sections.blacklistedContracts.values()),
  };
}

export function buildAddressRemarkMap(
  entries: readonly AddressEntry[],
): ReadonlyMap<string, string> {
  const remarks = new Map<string, string>();

  for (const entry of entries) {
    if (entry.remark !== undefined) {
      remarks.set(addressKey(entry.address), entry.remark);
    }
  }

  return remarks;
}

function parseAddressLine(
  line: string,
  sourceName: string,
  lineNumber: number,
): AddressEntry {
  const commaIndex = line.indexOf(",");
  const rawAddress = commaIndex === -1 ? line : line.slice(0, commaIndex);
  const rawRemark = commaIndex === -1 ? undefined : line.slice(commaIndex + 1);
  const address = normalizeAddress(rawAddress.trim(), `${sourceName}:${lineNumber} address`);
  const remark = rawRemark?.trim();

  return remark === undefined || remark === "" ? { address } : { address, remark };
}

function requireSection(
  seenSections: ReadonlySet<SectionName>,
  sectionName: SectionName,
  sourceName: string,
): void {
  if (!seenSections.has(sectionName)) {
    throw new Error(`${sourceName}: missing [${sectionName}] section`);
  }
}

function isSectionName(sectionName: string): sectionName is SectionName {
  return SECTION_NAMES.has(sectionName as SectionName);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
