import { describe, expect, test } from "bun:test";
import type { Address, Hash } from "viem";
import type { CollectiveInteractionAlert } from "./detector.ts";
import { formatTelegramAlert, formatUtc8, sendTelegramAlert } from "./telegram.ts";

describe("formatUtc8", () => {
  test("formats timestamps in UTC+8", () => {
    expect(formatUtc8("2026-05-14T12:34:56.000Z")).toBe("2026-05-14 20:34:56 UTC+8");
  });
});

describe("formatTelegramAlert", () => {
  test("includes copyable contract address, etherscan links, transaction links, and UTC+8 timestamps", () => {
    const message = formatTelegramAlert(alert());

    expect(message).toContain(
      "<code>0x00000000000000000000000000000000000000aa</code>",
    );
    expect(message).toContain(
      '<a href="https://etherscan.io/address/0x00000000000000000000000000000000000000aa">🌐查看合约</a>',
    );
    expect(message).not.toContain("OpenSea");
    expect(message).toContain("2026-05-14 20:00:00 UTC+8");
    expect(message).toContain(
      '团队 &amp; A (0x0000000000000000000000000000000000000001): mint | <a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000000001">tx</a>',
    );
    expect(message).not.toContain("0x00000000...00000001");
  });

  test("adds an OpenSea link beside the contract link for NFT alerts", () => {
    const openSeaUrl =
      "https://opensea.io/assets/ethereum/0x00000000000000000000000000000000000000aa";
    const message = formatTelegramAlert(alert({ openSeaUrl }));

    expect(message).toContain(
      `<a href="https://etherscan.io/address/0x00000000000000000000000000000000000000aa">🌐查看合约</a> | <a href="${openSeaUrl}">OpenSea</a>`,
    );
  });
});

describe("sendTelegramAlert", () => {
  test("posts formatted HTML message to Telegram sendMessage", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return Response.json({ ok: true });
    };

    await sendTelegramAlert(
      {
        botToken: "123456:test-token",
        chatId: "-1001234567890",
      },
      alert(),
      fetchImpl,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123456:test-token/sendMessage");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.chat_id).toBe("-1001234567890");
    expect(body.parse_mode).toBe("HTML");
    expect(body.disable_web_page_preview).toBe(true);
    expect(body.text).toContain("https://etherscan.io/address/");
  });

  test("throws when Telegram returns an API error", async () => {
    const fetchImpl = async (): Promise<Response> =>
      Response.json({ ok: false, description: "chat not found" }, { status: 400 });

    await expect(
      sendTelegramAlert(
        {
          botToken: "123456:test-token",
          chatId: "-1001234567890",
        },
        alert(),
        fetchImpl,
      ),
    ).rejects.toThrow("Telegram sendMessage failed: chat not found");
  });
});

function alert(overrides: Partial<CollectiveInteractionAlert> = {}): CollectiveInteractionAlert {
  return {
    kind: "collective_contract_interaction",
    contractAddress: "0x00000000000000000000000000000000000000aa" as Address,
    windowSeconds: 300,
    minUniqueAddresses: 2,
    uniqueAddressCount: 2,
    participantAddresses: [
      "0x0000000000000000000000000000000000000001" as Address,
      "0x0000000000000000000000000000000000000002" as Address,
    ],
    participantAddressDetails: [
      {
        address: "0x0000000000000000000000000000000000000001" as Address,
        remark: "团队 & A",
        methodNames: ["mint"],
        methodSelectors: ["0x40c10f19"],
        transactionHashes: [`0x${"1".padStart(64, "0")}` as Hash],
      },
      {
        address: "0x0000000000000000000000000000000000000002" as Address,
        methodNames: ["approve"],
        methodSelectors: ["0x095ea7b3"],
        transactionHashes: [`0x${"2".padStart(64, "0")}` as Hash],
      },
    ],
    transactionHashes: [
      `0x${"1".padStart(64, "0")}` as Hash,
      `0x${"2".padStart(64, "0")}` as Hash,
    ],
    firstInteractionAt: "2026-05-14T12:00:00.000Z",
    latestInteractionAt: "2026-05-14T12:01:00.000Z",
    triggerBlockNumber: 123n,
    triggerBlockTimestamp: "2026-05-14T12:01:00.000Z",
    ...overrides,
  };
}
