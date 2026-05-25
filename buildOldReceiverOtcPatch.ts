#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress } from "viem";

const OLD_RECEIVER = "0x6F721D0A8aBDb5dBBdaB3c05eFA81371C0d21D68".toLowerCase();
const MERGED_CSV = join("..", "OTCMerged.csv");
const RECEIVER_TRANSFERS_CSV = "hl-receiver-inbound-combined-6f721d-ce7cd6.csv";
const UPDATED_MERGED_CSV = join("..", "OTCMerged.with-old-receiver.csv");
const PATCH_CSV = join("..", "OTC-old-receiver-db-patch.csv");
const EVIDENCE_CSV = join("..", "OTC-old-receiver-transfer-evidence.csv");
const UPSERT_DECIMAL_SQL = join("..", "OTC-old-receiver-upsert-decimal.sql");
const UPSERT_WEI18_SQL = join("..", "OTC-old-receiver-upsert-wei18.sql");
const ACCOUNT_TYPE_FILE = "contract_check_progressv2.json";
const OTC_DECIMALS = 8;
const DB_WEI_DECIMALS = 18;

type CsvRecord = Record<string, string>;

type MergedRow = {
  cells: string[];
  normalizedAddress: string;
};

type PatchRow = {
  address: string;
  action: "update" | "insert";
  accountType: string;
  currentOtc: bigint;
  deltaOtc: bigint;
  newOtc: bigint;
  evidenceCount: number;
  note: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(filePath: string) {
  const lines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`CSV is empty: ${filePath}`);
  }

  const headers = parseCsvLine(lines[0]);
  const records = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return { headers, records, lines };
}

function csvEscape(value: string | bigint | number) {
  const stringValue = value.toString();
  if (/["\n\r,]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function checksum(address: string) {
  return getAddress(address);
}

function toScaledAmount(value: string | number, decimals = OTC_DECIMALS) {
  const valueString = value.toString();

  if (/e/i.test(valueString)) {
    return toScaledAmount(Number(value).toFixed(decimals), decimals);
  }

  const sign = valueString.startsWith("-") ? -1n : 1n;
  const unsignedValue = valueString.replace(/^-/, "");
  const [integerPart, fractionPart = ""] = unsignedValue.split(".");
  const paddedFraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);

  return sign * (BigInt(integerPart || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0"));
}

function formatScaledAmount(value: bigint, decimals = OTC_DECIMALS) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const integer = absolute / scale;
  const fraction = (absolute % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}

function scaleOtcToWei(value: bigint) {
  return value * 10n ** BigInt(DB_WEI_DECIMALS - OTC_DECIMALS);
}

function loadAddressTypes() {
  const out = new Map<string, string>();

  try {
    const parsed = JSON.parse(readFileSync(ACCOUNT_TYPE_FILE, "utf-8")) as Record<string, Record<string, string>>;
    for (const batch of Object.values(parsed)) {
      for (const [address, type] of Object.entries(batch)) {
        out.set(normalizeAddress(address), type);
      }
    }
  } catch {
    // Unknown account types are acceptable for OTC-only inserts.
  }

  return out;
}

function parseMergedCsv() {
  const lines = readFileSync(MERGED_CSV, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  const fullHeaders = parseCsvLine(lines[0]);
  const headers = fullHeaders.slice(0, 11);
  const rows: MergedRow[] = [];
  const rowsByAddress = new Map<string, MergedRow>();

  for (const line of lines.slice(1)) {
    const fullCells = parseCsvLine(line);
    const cells = fullCells.slice(0, 11);
    const normalizedAddress = normalizeAddress(cells[0]);
    const row = { cells, normalizedAddress };
    rows.push(row);
    rowsByAddress.set(normalizedAddress, row);
  }

  return { headers, rows, rowsByAddress };
}

function aggregateOldReceiverTransfers() {
  const { records } = parseCsv(RECEIVER_TRANSFERS_CSV);
  const amountBySender = new Map<string, bigint>();
  const evidenceBySender = new Map<string, CsvRecord[]>();
  const evidenceRows: CsvRecord[] = [];
  let skippedSelfTransfers = 0;

  for (const record of records) {
    const toAddress = normalizeAddress(record.toAddress);
    const fromAddress = normalizeAddress(record.fromAddress);
    const amount = toScaledAmount(record.amount || "0");

    if (toAddress !== OLD_RECEIVER || amount <= 0n) continue;

    if (fromAddress === OLD_RECEIVER) {
      skippedSelfTransfers++;
      continue;
    }

    amountBySender.set(fromAddress, (amountBySender.get(fromAddress) ?? 0n) + amount);
    evidenceBySender.set(fromAddress, [...(evidenceBySender.get(fromAddress) ?? []), record]);
    evidenceRows.push(record);
  }

  return { amountBySender, evidenceBySender, evidenceRows, skippedSelfTransfers };
}

function buildPatchRows() {
  const addressTypes = loadAddressTypes();
  const { headers, rows, rowsByAddress } = parseMergedCsv();
  const { amountBySender, evidenceBySender, evidenceRows, skippedSelfTransfers } =
    aggregateOldReceiverTransfers();
  const deltaByAddress = new Map(amountBySender);
  const oldReceiverRow = rowsByAddress.get(OLD_RECEIVER);
  const currentOldReceiverOtc = oldReceiverRow ? toScaledAmount(oldReceiverRow.cells[9] || "0") : 0n;

  if (currentOldReceiverOtc > 0n) {
    deltaByAddress.set(OLD_RECEIVER, (deltaByAddress.get(OLD_RECEIVER) ?? 0n) - currentOldReceiverOtc);
  }

  const patchRows: PatchRow[] = [];

  for (const [address, deltaOtc] of Array.from(deltaByAddress.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (deltaOtc === 0n) continue;

    const existing = rowsByAddress.get(address);
    const currentOtc = existing ? toScaledAmount(existing.cells[9] || "0") : 0n;
    const newOtc = currentOtc + deltaOtc;

    if (newOtc < 0n) {
      throw new Error(`negative OTC after patch for ${address}`);
    }

    const action = existing ? "update" : "insert";
    const accountType = existing?.cells[1] || addressTypes.get(address) || "unknown";
    const note =
      address === OLD_RECEIVER
        ? "remove old receiver treasury-forwarding credit"
        : "credit payer who sent funds to old receiver";

    patchRows.push({
      address: checksum(address),
      action,
      accountType,
      currentOtc,
      deltaOtc,
      newOtc,
      evidenceCount: evidenceBySender.get(address)?.length ?? 0,
      note,
    });
  }

  return { headers, rows, rowsByAddress, patchRows, evidenceRows, skippedSelfTransfers };
}

function writeUpdatedMergedCsv(
  headers: string[],
  rows: MergedRow[],
  rowsByAddress: Map<string, MergedRow>,
  patchRows: PatchRow[],
) {
  for (const patch of patchRows) {
    const normalized = normalizeAddress(patch.address);
    const existing = rowsByAddress.get(normalized);

    if (existing) {
      existing.cells[1] = patch.accountType;
      existing.cells[9] = formatScaledAmount(patch.newOtc);
      continue;
    }

    const cells = [
      patch.address,
      patch.accountType,
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      formatScaledAmount(patch.newOtc),
      "0",
    ];
    const row = { cells, normalizedAddress: normalized };
    rows.push(row);
    rowsByAddress.set(normalized, row);
  }

  rows.sort((a, b) => a.normalizedAddress.localeCompare(b.normalizedAddress));

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.cells.map(csvEscape).join(",")),
  ].join("\n");

  writeFileSync(UPDATED_MERGED_CSV, `${csv}\n`, "utf-8");
}

function writePatchCsv(patchRows: PatchRow[]) {
  const headers = [
    "address",
    "action",
    "accountType",
    "currentOtc",
    "deltaOtc",
    "newOtc",
    "currentOtcWei18",
    "deltaOtcWei18",
    "newOtcWei18",
    "evidenceCount",
    "note",
  ];

  const csv = [
    headers.join(","),
    ...patchRows.map((row) =>
      [
        row.address,
        row.action,
        row.accountType,
        formatScaledAmount(row.currentOtc),
        formatScaledAmount(row.deltaOtc),
        formatScaledAmount(row.newOtc),
        scaleOtcToWei(row.currentOtc),
        scaleOtcToWei(row.deltaOtc),
        scaleOtcToWei(row.newOtc),
        row.evidenceCount,
        row.note,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  writeFileSync(PATCH_CSV, `${csv}\n`, "utf-8");
}

function writeEvidenceCsv(evidenceRows: CsvRecord[]) {
  const headers = [
    "isoTime",
    "hash",
    "type",
    "token",
    "amount",
    "fromAddress",
    "toAddress",
    "queriedAccount",
  ];

  const csv = [
    headers.join(","),
    ...evidenceRows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\n");

  writeFileSync(EVIDENCE_CSV, `${csv}\n`, "utf-8");
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function writeDecimalSql(patchRows: PatchRow[]) {
  const values = patchRows
    .map((row) =>
      [
        sqlString(row.address),
        sqlString(row.accountType),
        formatScaledAmount(row.newOtc),
        sqlString(row.note),
      ].join(", "),
    )
    .map((row) => `  (${row})`)
    .join(",\n");

  const sql = `-- Applies corrected OTC decimal balances from ${PATCH_CSV}.
-- Use this only if your DB stores OTC in human decimal units, as OTCMerged.csv does.
WITH patch(address, account_type, new_otc, note) AS (
  VALUES
${values}
)
INSERT INTO holdings (address, "Account Type", "OTC")
SELECT address, account_type, new_otc::numeric
FROM patch
ON CONFLICT (address) DO UPDATE SET
  "OTC" = EXCLUDED."OTC",
  "Account Type" = COALESCE(NULLIF(holdings."Account Type", ''), EXCLUDED."Account Type");
`;

  writeFileSync(UPSERT_DECIMAL_SQL, sql, "utf-8");
}

function writeWeiSql(patchRows: PatchRow[]) {
  const values = patchRows
    .map((row) =>
      [
        sqlString(row.address),
        sqlString(row.accountType),
        scaleOtcToWei(row.newOtc).toString(),
        sqlString(row.note),
      ].join(", "),
    )
    .map((row) => `  (${row})`)
    .join(",\n");

  const sql = `-- Applies corrected OTC wei balances from ${PATCH_CSV}.
-- Use this only if your DB was loaded by loadResolvedSnapshotToPostgres.ts.
WITH patch(address, account_type, new_otc, note) AS (
  VALUES
${values}
)
INSERT INTO holdings (address, otc, is_eoa, remarks, source_file, snapshot_block)
SELECT address, new_otc::numeric, account_type = 'eoa', note, 'old-receiver-otc-patch', 297801672
FROM patch
ON CONFLICT (address) DO UPDATE SET
  otc = EXCLUDED.otc,
  remarks = CONCAT_WS('; ', NULLIF(holdings.remarks, ''), EXCLUDED.remarks),
  loaded_at = now();
`;

  writeFileSync(UPSERT_WEI18_SQL, sql, "utf-8");
}

const { headers, rows, rowsByAddress, patchRows, evidenceRows, skippedSelfTransfers } = buildPatchRows();

writeUpdatedMergedCsv(headers, rows, rowsByAddress, patchRows);
writePatchCsv(patchRows);
writeEvidenceCsv(evidenceRows);
writeDecimalSql(patchRows);
writeWeiSql(patchRows);

const totalPositiveDelta = patchRows
  .filter((row) => row.deltaOtc > 0n)
  .reduce((sum, row) => sum + row.deltaOtc, 0n);
const totalNegativeDelta = patchRows
  .filter((row) => row.deltaOtc < 0n)
  .reduce((sum, row) => sum + row.deltaOtc, 0n);

console.log(`old receiver evidence rows: ${evidenceRows.length}`);
console.log(`skipped old receiver self-transfers: ${skippedSelfTransfers}`);
console.log(`patch rows: ${patchRows.length}`);
console.log(`insert rows: ${patchRows.filter((row) => row.action === "insert").length}`);
console.log(`update rows: ${patchRows.filter((row) => row.action === "update").length}`);
console.log(`positive OTC delta: ${formatScaledAmount(totalPositiveDelta)}`);
console.log(`negative OTC delta: ${formatScaledAmount(totalNegativeDelta)}`);
console.log(`net OTC delta: ${formatScaledAmount(totalPositiveDelta + totalNegativeDelta)}`);
console.log(`wrote ${UPDATED_MERGED_CSV}`);
console.log(`wrote ${PATCH_CSV}`);
console.log(`wrote ${EVIDENCE_CSV}`);
console.log(`wrote ${UPSERT_DECIMAL_SQL}`);
console.log(`wrote ${UPSERT_WEI18_SQL}`);
