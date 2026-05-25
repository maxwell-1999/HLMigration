#!/usr/bin/env bun

type LedgerUpdate = {
  time: number;
  hash?: string;
  delta?: Record<string, unknown>;
};

type CsvRow = {
  queriedAccount: string;
  direction: string;
  timeMs: string;
  isoTime: string;
  hash: string;
  type: string;
  token: string;
  amount: string;
  usdcValue: string;
  fromAddress: string;
  toAddress: string;
  fee: string;
  nonce: string;
  sourceDex: string;
  destinationDex: string;
};

const receiverArgs = Bun.argv.slice(2);
const receiverAccounts = (
  receiverArgs.length > 0
    ? receiverArgs
    : [
        "0x6F721D0A8aBDb5dBBdaB3c05eFA81371C0d21D68",
        "0xce7cd6fa640b613b887a08eecc12a4f4e29180ad",
      ]
).map(normalizeAddress);

if (receiverAccounts.length === 0) {
  throw new Error("pass at least one receiver address");
}

function normalizeAddress(address: string) {
  const value = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(`invalid address: ${address}`);
  }
  return value;
}

function stringValue(value: unknown) {
  if (value == null) return "";
  return String(value);
}

async function fetchLedgerUpdates(user: string) {
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "userNonFundingLedgerUpdates",
      user,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API failed for ${user}: ${response.status}`);
  }

  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error(`unexpected Hyperliquid response for ${user}: ${JSON.stringify(body)}`);
  }

  return body as LedgerUpdate[];
}

function rowFromUpdate(queriedAccount: string, update: LedgerUpdate): CsvRow {
  const delta = update.delta ?? {};
  const type = stringValue(delta.type);
  const user = stringValue(delta.user).toLowerCase();
  const destination = stringValue(delta.destination).toLowerCase();
  const amount = stringValue(delta.amount || delta.usdc);
  const direction =
    destination === queriedAccount
      ? "in"
      : user === queriedAccount
        ? "out"
        : type === "deposit"
          ? "deposit"
          : type === "withdraw"
            ? "withdraw"
            : "unknown";

  return {
    queriedAccount,
    direction,
    timeMs: stringValue(update.time),
    isoTime: Number.isFinite(update.time) ? new Date(update.time).toISOString() : "",
    hash: stringValue(update.hash),
    type,
    token: stringValue(delta.token || (amount ? "USDC" : "")),
    amount,
    usdcValue: stringValue(delta.usdcValue || delta.usdc || delta.amount),
    fromAddress: user,
    toAddress: destination,
    fee: stringValue(delta.fee || delta.nativeTokenFee),
    nonce: stringValue(delta.nonce),
    sourceDex: stringValue(delta.sourceDex),
    destinationDex: stringValue(delta.destinationDex),
  };
}

function isTransferLike(row: CsvRow) {
  return ["spotTransfer", "internalTransfer", "send", "deposit", "withdraw"].includes(row.type);
}

function dedupeRows(rows: CsvRow[]) {
  const seen = new Set<string>();
  const out: CsvRow[] = [];

  for (const row of rows) {
    const key = [
      row.hash,
      row.timeMs,
      row.type,
      row.amount,
      row.fromAddress,
      row.toAddress,
      row.queriedAccount,
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.sort((a, b) => Number(a.timeMs) - Number(b.timeMs));
}

function dedupeTransferEvents(rows: CsvRow[]) {
  const seen = new Set<string>();
  const out: CsvRow[] = [];

  for (const row of rows) {
    const key = [
      row.hash,
      row.timeMs,
      row.type,
      row.amount,
      row.fromAddress,
      row.toAddress,
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.sort((a, b) => Number(a.timeMs) - Number(b.timeMs));
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function toCsv(rows: CsvRow[]) {
  const headers = [
    "queriedAccount",
    "direction",
    "timeMs",
    "isoTime",
    "hash",
    "type",
    "token",
    "amount",
    "usdcValue",
    "fromAddress",
    "toAddress",
    "fee",
    "nonce",
    "sourceDex",
    "destinationDex",
  ] as const;

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function short(address: string) {
  return address.slice(2, 8);
}

const rowsByReceiver = new Map<string, CsvRow[]>();

for (const receiver of receiverAccounts) {
  const updates = await fetchLedgerUpdates(receiver);
  const rows = dedupeRows(updates.map((update) => rowFromUpdate(receiver, update)).filter(isTransferLike));
  rowsByReceiver.set(receiver, rows);

  const file = `hl-receiver-transfers-${short(receiver)}.csv`;
  await Bun.write(file, toCsv(rows));
  console.log(`receiver=${receiver}`);
  console.log(`receiver transfer rows: ${rows.length} -> ${file}`);
}

const receiverSet = new Set(receiverAccounts);
const combinedInboundRows = dedupeTransferEvents(
  [...rowsByReceiver.values()]
    .flat()
    .filter((row) => receiverSet.has(row.toAddress.toLowerCase()))
);
const combinedFile = `hl-receiver-inbound-combined-${receiverAccounts.map(short).join("-")}.csv`;

await Bun.write(combinedFile, toCsv(combinedInboundRows));
console.log(`combined receiver inbound rows: ${combinedInboundRows.length} -> ${combinedFile}`);
