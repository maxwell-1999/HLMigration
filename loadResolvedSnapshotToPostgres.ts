import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Client } from "pg";
import { getAddress } from "viem";
import OTCData from "./OTCData";

const DEFAULT_RAW_INPUT_FILE = "snapshot-297801672.csv";
const DEFAULT_RESOLVED_INPUT_FILE = "snapshot-297801672-v2-resolved-types.csv";
const DEFAULT_TABLE_NAME = "holdings";
const SNAPSHOT_BLOCK = 297801672;
const BATCH_SIZE = 1000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

const args = new Set(process.argv.slice(2));

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const rawInputFile =
  getArgValue("--raw-input") ?? Bun.env.RAW_SNAPSHOT_CSV ?? DEFAULT_RAW_INPUT_FILE;
const resolvedInputFile =
  getArgValue("--resolved-input") ??
  Bun.env.RESOLVED_SNAPSHOT_CSV ??
  DEFAULT_RESOLVED_INPUT_FILE;
const tableName = getArgValue("--table") ?? Bun.env.HOLDINGS_TABLE ?? DEFAULT_TABLE_NAME;
const shouldExecute = args.has("--execute");
const shouldReplace = args.has("--replace");

type CsvRow = Record<string, string>;

type PreparedRow = {
  address: string;
  raw_bfr: string;
  raw_esbfr: string;
  fsblp: string;
  vestor1: string;
  vestor2: string;
  staking: string;
  camelot: string;
  otc: string;
  total: string;
  is_eoa: boolean;
  remarks: string;
  source_file: string;
  snapshot_block: number;
};

function assertSafeIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}

function quoteIdentifier(identifier: string) {
  assertSafeIdentifier(identifier);
  return `"${identifier}"`;
}

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
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalizeType(accountType: string) {
  return accountType.trim().toLowerCase();
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function assertIntegerString(value: string, label: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Expected raw wei integer for ${label}, got: ${value}`);
  }
  return value;
}

function rawWei(row: CsvRow | undefined, column: string) {
  return assertIntegerString(row?.[column] ?? "0", column);
}

function toScaledAmount(value: number | string, decimals = 18) {
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

function loadRowsByAddress(csvRows: CsvRow[]) {
  const rowsByAddress = new Map<string, CsvRow>();

  for (const row of csvRows) {
    rowsByAddress.set(normalizeAddress(row.address ?? row.Address), row);
  }

  return rowsByAddress;
}

function loadOtcWeiByAddress() {
  const otcByAddress = new Map<string, bigint>();

  for (const event of OTCData) {
    if (event.amount <= 0) continue;

    const address = normalizeAddress(event.fromAddress);
    const amount = toScaledAmount(event.amount, 18);

    otcByAddress.set(address, (otcByAddress.get(address) ?? 0n) + amount);
  }

  return otcByAddress;
}

function prepareRows(resolvedRows: CsvRow[], rawRows: CsvRow[]) {
  const sourceFile = `${basename(rawInputFile)} + ${basename(resolvedInputFile)}`;
  const rawByAddress = loadRowsByAddress(rawRows);
  const otcByAddress = loadOtcWeiByAddress();
  const prepared: PreparedRow[] = [];
  const skipped = {
    nonEoa: 0,
    zeroOrDead: 0,
    invalidAddress: 0,
    missingRaw: 0,
  };

  for (const row of resolvedRows) {
    if (normalizeType(row["Account Type"] ?? "") !== "eoa") {
      skipped.nonEoa++;
      continue;
    }

    let address: string;
    try {
      address = getAddress(row.Address);
    } catch {
      skipped.invalidAddress++;
      continue;
    }

    const normalized = address.toLowerCase();
    if (normalized === ZERO_ADDRESS || normalized === DEAD_ADDRESS) {
      skipped.zeroOrDead++;
      continue;
    }

    const rawRow = rawByAddress.get(normalized);
    if (!rawRow) {
      skipped.missingRaw++;
    }

    prepared.push({
      address,
      raw_bfr: rawWei(rawRow, "raw_bfr_wei"),
      raw_esbfr: rawWei(rawRow, "raw_esbfr_wei"),
      fsblp: rawWei(rawRow, "fsblp_wei"),
      vestor1: rawWei(rawRow, "vester1_wei"),
      vestor2: rawWei(rawRow, "vester2_wei"),
      staking: rawWei(rawRow, "staking_wei"),
      camelot: rawWei(rawRow, "camelot_wei"),
      otc: (otcByAddress.get(normalized) ?? 0n).toString(),
      total: rawWei(rawRow, "total_wei"),
      is_eoa: true,
      remarks: "",
      source_file: sourceFile,
      snapshot_block: SNAPSHOT_BLOCK,
    });
  }

  return { prepared, skipped };
}

async function ensureTable(client: Client, table: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      address TEXT PRIMARY KEY,
      raw_bfr NUMERIC(78,0) NOT NULL DEFAULT 0,
      raw_esbfr NUMERIC(78,0) NOT NULL DEFAULT 0,
      fsblp NUMERIC(78,0) NOT NULL DEFAULT 0,
      vestor1 NUMERIC(78,0) NOT NULL DEFAULT 0,
      vestor2 NUMERIC(78,0) NOT NULL DEFAULT 0,
      staking NUMERIC(78,0) NOT NULL DEFAULT 0,
      camelot NUMERIC(78,0) NOT NULL DEFAULT 0,
      otc NUMERIC(78,0) NOT NULL DEFAULT 0,
      total NUMERIC(78,0) NOT NULL DEFAULT 0,
      is_eoa BOOLEAN NOT NULL DEFAULT TRUE,
      remarks TEXT NOT NULL DEFAULT '',
      source_file TEXT NOT NULL DEFAULT '',
      snapshot_block INTEGER NOT NULL DEFAULT ${SNAPSHOT_BLOCK},
      loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    ALTER TABLE ${table}
      ADD COLUMN IF NOT EXISTS camelot NUMERIC(78,0) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS otc NUMERIC(78,0) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total NUMERIC(78,0) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS source_file TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS snapshot_block INTEGER NOT NULL DEFAULT ${SNAPSHOT_BLOCK},
      ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ NOT NULL DEFAULT now();
  `);
}

async function insertBatch(client: Client, table: string, rows: PreparedRow[]) {
  const dbColumns = [
    "address",
    "raw_bfr",
    "raw_esbfr",
    "fsblp",
    "vestor1",
    "vestor2",
    "staking",
    "camelot",
    "otc",
    "total",
    "is_eoa",
    "remarks",
    "source_file",
    "snapshot_block",
  ];

  const values = rows.flatMap((row) => dbColumns.map((column) => row[column as keyof PreparedRow]));
  const placeholders = rows.map((_, rowIndex) => {
    const offset = rowIndex * dbColumns.length;
    return `(${dbColumns.map((__, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
  });

  await client.query(
    `
      INSERT INTO ${table} (${dbColumns.map(quoteIdentifier).join(", ")})
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (address) DO UPDATE SET
        raw_bfr = EXCLUDED.raw_bfr,
        raw_esbfr = EXCLUDED.raw_esbfr,
        fsblp = EXCLUDED.fsblp,
        vestor1 = EXCLUDED.vestor1,
        vestor2 = EXCLUDED.vestor2,
        staking = EXCLUDED.staking,
        camelot = EXCLUDED.camelot,
        otc = EXCLUDED.otc,
        total = EXCLUDED.total,
        is_eoa = EXCLUDED.is_eoa,
        remarks = EXCLUDED.remarks,
        source_file = EXCLUDED.source_file,
        snapshot_block = EXCLUDED.snapshot_block,
        loaded_at = now();
    `,
    values,
  );
}

async function loadRows(rows: PreparedRow[]) {
  const connectionString = Bun.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for --execute");
  }

  const table = quoteIdentifier(tableName);
  const client = new Client({ connectionString });

  await client.connect();
  try {
    await client.query("BEGIN");
    await ensureTable(client, table);

    if (shouldReplace) {
      await client.query(`TRUNCATE TABLE ${table};`);
    }

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      await insertBatch(client, table, batch);
      console.log(`Inserted ${Math.min(start + BATCH_SIZE, rows.length)}/${rows.length}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const resolvedRows = parseCsv(resolvedInputFile);
  const rawRows = parseCsv(rawInputFile);
  const { prepared, skipped } = prepareRows(resolvedRows, rawRows);

  console.log(`Raw input file: ${rawInputFile}`);
  console.log(`Resolved input file: ${resolvedInputFile}`);
  console.log(`Target table: ${tableName}`);
  console.log(`Raw CSV rows: ${rawRows.length}`);
  console.log(`Resolved CSV rows: ${resolvedRows.length}`);
  console.log(`Prepared EOA rows: ${prepared.length}`);
  console.log(`Skipped non-EOA rows: ${skipped.nonEoa}`);
  console.log(`Skipped zero/dead rows: ${skipped.zeroOrDead}`);
  console.log(`Skipped invalid addresses: ${skipped.invalidAddress}`);
  console.log(`Prepared rows missing raw snapshot row: ${skipped.missingRaw}`);

  if (!shouldExecute) {
    console.log("Dry run only. Add --execute to write to DB.");
    return;
  }

  if (!shouldReplace) {
    throw new Error("Use --replace with --execute so excluded non-EOA/zero rows cannot remain in the target table.");
  }

  await loadRows(prepared);
  console.log("DB load complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
