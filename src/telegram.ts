import type { CollectiveInteractionAlert, ParticipantAddressDetail } from "./detector.ts";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramSendResult = {
  ok: boolean;
  description?: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const MAX_PARTICIPANTS_IN_MESSAGE = 25;

export async function sendTelegramAlert(
  config: TelegramConfig,
  alert: CollectiveInteractionAlert,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await sendTelegramMessage(config, {
    text: formatTelegramAlert(alert),
    parseMode: "HTML",
    disableWebPagePreview: true,
  }, fetchImpl);
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  message: {
    text: string;
    parseMode?: "HTML";
    disableWebPagePreview?: boolean;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message.text,
        ...(message.parseMode === undefined ? {} : { parse_mode: message.parseMode }),
        ...(message.disableWebPagePreview === undefined
          ? {}
          : { disable_web_page_preview: message.disableWebPagePreview }),
      }),
    },
  );

  let payload: TelegramSendResult | undefined;
  try {
    payload = (await response.json()) as TelegramSendResult;
  } catch {
    payload = undefined;
  }

  if (!response.ok || payload?.ok === false) {
    const description = payload?.description ?? `${response.status} ${response.statusText}`;
    throw new Error(`Telegram sendMessage failed: ${description}`);
  }
}

export function formatTelegramAlert(alert: CollectiveInteractionAlert): string {
  const contractUrl = etherscanAddressUrl(alert.contractAddress);
  const blockUrl = `https://etherscan.io/block/${alert.triggerBlockNumber.toString()}`;
  const participantLines = formatParticipantLines(alert.participantAddressDetails);
  const contractLinks = formatContractLinks(contractUrl, alert.openSeaUrl);

  return [
    "<b>Onchain Alert</b>",
    `合约: <code>${escapeHtml(alert.contractAddress)}</code>`,
    contractLinks,
    `窗口: ${formatWindow(alert.windowSeconds)}`,
    `参与地址: ${alert.uniqueAddressCount} / ${alert.minUniqueAddresses}`,
    `首次交互: ${formatUtc8(alert.firstInteractionAt)}`,
    `最近交互: ${formatUtc8(alert.latestInteractionAt)}`,
    `触发区块: <a href="${blockUrl}">${alert.triggerBlockNumber.toString()}</a>`,
    "",
    "<b>参与地址</b>",
    ...participantLines,
  ].join("\n");
}

export function formatUtc8(isoTimestamp: string): string {
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  }

  const utc8Date = new Date(timestamp + 8 * 60 * 60 * 1000);
  const year = utc8Date.getUTCFullYear();
  const month = pad2(utc8Date.getUTCMonth() + 1);
  const day = pad2(utc8Date.getUTCDate());
  const hours = pad2(utc8Date.getUTCHours());
  const minutes = pad2(utc8Date.getUTCMinutes());
  const seconds = pad2(utc8Date.getUTCSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC+8`;
}

function formatParticipantLines(
  participantAddressDetails: readonly ParticipantAddressDetail[],
): string[] {
  const visibleParticipants = participantAddressDetails.slice(0, MAX_PARTICIPANTS_IN_MESSAGE);
  const lines = visibleParticipants.map((participant) => {
    const addressLabel =
      participant.remark === undefined
        ? participant.address
        : `${participant.remark} (${participant.address})`;
    const methodLabel =
      participant.methodNames.length === 0 ? "unknown" : participant.methodNames.join(", ");
    const transactionLinks = formatTransactionLinks(participant.transactionHashes);

    return `- ${escapeHtml(addressLabel)}: ${escapeHtml(methodLabel)} | ${transactionLinks}`;
  });
  const omittedCount = participantAddressDetails.length - visibleParticipants.length;

  if (omittedCount > 0) {
    lines.push(`... 还有 ${omittedCount} 个地址未显示`);
  }

  return lines;
}

function formatTransactionLinks(transactionHashes: readonly string[]): string {
  if (transactionHashes.length === 0) {
    return "unknown";
  }

  return transactionHashes
    .map((transactionHash) => {
      const transactionUrl = etherscanTransactionUrl(transactionHash);
      return `<a href="${transactionUrl}">tx</a>`;
    })
    .join(", ");
}

function formatWindow(windowSeconds: number): string {
  if (windowSeconds % 60 === 0) {
    return `${windowSeconds / 60} 分钟`;
  }

  return `${windowSeconds} 秒`;
}

function formatContractLinks(contractUrl: string, openSeaUrl: string | undefined): string {
  const etherscanLink = `<a href="${contractUrl}">🌐查看合约</a>`;
  if (openSeaUrl === undefined) {
    return etherscanLink;
  }

  return `${etherscanLink} | <a href="${openSeaUrl}">OpenSea</a>`;
}

function etherscanAddressUrl(address: string): string {
  return `https://etherscan.io/address/${address}`;
}

function etherscanTransactionUrl(transactionHash: string): string {
  return `https://etherscan.io/tx/${transactionHash}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
