import type { Address, Hash, Hex } from "viem";
import { addressKey } from "./address.ts";

export type InteractionEvent = {
  contractAddress: Address;
  from: Address;
  transactionHash: Hash;
  methodSelector?: Hex;
  methodName: string;
  openSeaUrl?: string;
  blockNumber: bigint;
  timestamp: number;
};

export type CollectiveInteractionAlert = {
  kind: "collective_contract_interaction";
  contractAddress: Address;
  windowSeconds: number;
  minUniqueAddresses: number;
  uniqueAddressCount: number;
  participantAddresses: readonly Address[];
  participantAddressDetails: readonly ParticipantAddressDetail[];
  transactionHashes: readonly Hash[];
  openSeaUrl?: string;
  firstInteractionAt: string;
  latestInteractionAt: string;
  triggerBlockNumber: bigint;
  triggerBlockTimestamp: string;
};

export type ParticipantAddressDetail = {
  address: Address;
  remark?: string;
  methodNames: readonly string[];
  methodSelectors: readonly Hex[];
  transactionHashes: readonly Hash[];
};

type ContractState = {
  events: InteractionEvent[];
  lastAlertedParticipants: Set<string>;
};

export class CollectiveInteractionDetector {
  readonly #states = new Map<string, ContractState>();

  constructor(
    private readonly options: {
      windowSeconds: number;
      minUniqueAddresses: number;
      addressRemarks?: ReadonlyMap<string, string>;
    },
  ) {
    if (!Number.isFinite(options.windowSeconds) || options.windowSeconds <= 0) {
      throw new Error("windowSeconds must be positive");
    }

    if (!Number.isInteger(options.minUniqueAddresses) || options.minUniqueAddresses <= 0) {
      throw new Error("minUniqueAddresses must be a positive integer");
    }
  }

  recordInteractions(
    events: readonly InteractionEvent[],
    currentTimestamp: number,
  ): CollectiveInteractionAlert[] {
    const affectedContracts = new Set<string>();

    for (const event of events) {
      const key = addressKey(event.contractAddress);
      const state = this.#stateFor(event.contractAddress);
      state.events.push(event);
      affectedContracts.add(key);
    }

    this.prune(currentTimestamp);

    const alerts: CollectiveInteractionAlert[] = [];
    for (const contractKey of affectedContracts) {
      const alert = this.#evaluateContract(contractKey);
      if (alert) {
        alerts.push(alert);
      }
    }

    return alerts;
  }

  prune(currentTimestamp: number): void {
    const cutoff = currentTimestamp - this.options.windowSeconds;

    for (const [contractKey, state] of this.#states) {
      state.events = state.events.filter((event) => event.timestamp >= cutoff);

      const participants = participantKeys(state.events);
      if (participants.size < this.options.minUniqueAddresses) {
        state.lastAlertedParticipants.clear();
      }

      if (state.events.length === 0 && state.lastAlertedParticipants.size === 0) {
        this.#states.delete(contractKey);
      }
    }
  }

  #stateFor(contractAddress: Address): ContractState {
    const key = addressKey(contractAddress);
    const existing = this.#states.get(key);
    if (existing) {
      return existing;
    }

    const created: ContractState = {
      events: [],
      lastAlertedParticipants: new Set<string>(),
    };
    this.#states.set(key, created);
    return created;
  }

  #evaluateContract(contractKey: string): CollectiveInteractionAlert | undefined {
    const state = this.#states.get(contractKey);
    if (!state) {
      return undefined;
    }

    const participants = participantKeys(state.events);
    if (participants.size < this.options.minUniqueAddresses) {
      state.lastAlertedParticipants.clear();
      return undefined;
    }

    const hasNewParticipant =
      state.lastAlertedParticipants.size === 0 ||
      Array.from(participants).some((participant) => !state.lastAlertedParticipants.has(participant));

    if (!hasNewParticipant) {
      return undefined;
    }

    state.lastAlertedParticipants = new Set(participants);
    return buildAlert(
      state.events,
      this.options.windowSeconds,
      this.options.minUniqueAddresses,
      this.options.addressRemarks ?? new Map(),
    );
  }
}

function participantKeys(events: readonly InteractionEvent[]): Set<string> {
  return new Set(events.map((event) => addressKey(event.from)));
}

function buildAlert(
  events: readonly InteractionEvent[],
  windowSeconds: number,
  minUniqueAddresses: number,
  addressRemarks: ReadonlyMap<string, string>,
): CollectiveInteractionAlert {
  if (events.length === 0) {
    throw new Error("Cannot build alert without events");
  }

  const orderedEvents = [...events].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber < right.blockNumber ? -1 : 1;
    }

    return left.transactionHash.localeCompare(right.transactionHash);
  });
  const firstEvent = orderedEvents[0];
  const latestEvent = orderedEvents[orderedEvents.length - 1];

  if (!firstEvent || !latestEvent) {
    throw new Error("Cannot build alert without ordered events");
  }

  const participantAddresses = new Map<string, Address>();
  const participantMethods = new Map<string, Map<string, Hex | undefined>>();
  const participantTransactions = new Map<string, Hash[]>();
  for (const event of orderedEvents) {
    const key = addressKey(event.from);
    participantAddresses.set(key, event.from);
    const methods = participantMethods.get(key) ?? new Map<string, Hex | undefined>();
    methods.set(event.methodName, event.methodSelector);
    participantMethods.set(key, methods);
    const transactionHashes = participantTransactions.get(key) ?? [];
    transactionHashes.push(event.transactionHash);
    participantTransactions.set(key, transactionHashes);
  }
  const participantAddressList = Array.from(participantAddresses.values());

  return {
    kind: "collective_contract_interaction",
    contractAddress: latestEvent.contractAddress,
    windowSeconds,
    minUniqueAddresses,
    uniqueAddressCount: participantAddresses.size,
    participantAddresses: participantAddressList,
    participantAddressDetails: participantAddressList.map((address) =>
      buildParticipantAddressDetail(
        address,
        addressRemarks,
        participantMethods,
        participantTransactions,
      ),
    ),
    transactionHashes: orderedEvents.map((event) => event.transactionHash),
    openSeaUrl: latestOpenSeaUrl(orderedEvents),
    firstInteractionAt: toIsoTimestamp(firstEvent.timestamp),
    latestInteractionAt: toIsoTimestamp(latestEvent.timestamp),
    triggerBlockNumber: latestEvent.blockNumber,
    triggerBlockTimestamp: toIsoTimestamp(latestEvent.timestamp),
  };
}

function buildParticipantAddressDetail(
  address: Address,
  addressRemarks: ReadonlyMap<string, string>,
  participantMethods: ReadonlyMap<string, ReadonlyMap<string, Hex | undefined>>,
  participantTransactions: ReadonlyMap<string, readonly Hash[]>,
): ParticipantAddressDetail {
  const remark = addressRemarks.get(addressKey(address));
  const methods = participantMethods.get(addressKey(address)) ?? new Map<string, Hex | undefined>();
  const methodNames = Array.from(methods.keys());
  const methodSelectors = Array.from(methods.values()).filter(
    (selector): selector is Hex => selector !== undefined,
  );
  const transactionHashes = participantTransactions.get(addressKey(address)) ?? [];

  return remark === undefined
    ? { address, methodNames, methodSelectors, transactionHashes }
    : { address, remark, methodNames, methodSelectors, transactionHashes };
}

function latestOpenSeaUrl(events: readonly InteractionEvent[]): string | undefined {
  return [...events].reverse().find((event) => event.openSeaUrl !== undefined)?.openSeaUrl;
}

function toIsoTimestamp(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString();
}
