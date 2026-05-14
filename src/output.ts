import type { CollectiveInteractionAlert } from "./detector.ts";

export function formatAlertForConsole(alert: CollectiveInteractionAlert): string {
  return JSON.stringify(
    {
      event: alert.kind,
      contractAddress: alert.contractAddress,
      windowSeconds: alert.windowSeconds,
      minUniqueAddresses: alert.minUniqueAddresses,
      uniqueAddressCount: alert.uniqueAddressCount,
      participantAddresses: alert.participantAddresses,
      participantAddressDetails: alert.participantAddressDetails,
      transactionHashes: alert.transactionHashes,
      firstInteractionAt: alert.firstInteractionAt,
      latestInteractionAt: alert.latestInteractionAt,
      triggerBlockNumber: alert.triggerBlockNumber.toString(),
      triggerBlockTimestamp: alert.triggerBlockTimestamp,
    },
    null,
    2,
  );
}
