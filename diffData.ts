import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const COLUMNS = [
  "rawBFR",
  "rawEsBFR",
  "fsBLP",
  "vester1",
  "vester2",
  "staking",
  "camelot",
] as const;

type Row = bigint[];
type Snapshot = Map<string, Row>;

function readCommittedDataJson() {
  const result = spawnSync("git", ["show", "HEAD:data.json"], {
    cwd: import.meta.dir,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 100,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to read HEAD:data.json");
  }

  return result.stdout;
}

function toBigIntValue(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid number: ${value}`);
    return BigInt(Math.trunc(value));
  }
  if (value == null) return 0n;

  throw new Error(`Unsupported value type: ${typeof value}`);
}

function parseSnapshot(json: string): Snapshot {
  const parsed = JSON.parse(json) as Record<string, unknown[]>;
  const snapshot: Snapshot = new Map();

  for (const [address, values] of Object.entries(parsed)) {
    snapshot.set(
      address.toLowerCase(),
      COLUMNS.map((_, index) => toBigIntValue(values[index] ?? 0))
    );
  }

  return snapshot;
}

function sumRow(row: Row) {
  return row.reduce((total, value) => total + value, 0n);
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}

function formatUnits(value: bigint, decimals = 18, maxFraction = 6) {
  const sign = value < 0n ? "-" : "";
  const absolute = abs(value);
  const scale = 10n ** BigInt(decimals);
  const integer = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0");
  const trimmedFraction = fraction
    .slice(0, maxFraction)
    .replace(/0+$/, "");

  return `${sign}${integer}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

function addRows(a: Row, b: Row): Row {
  return COLUMNS.map((_, index) => a[index] + b[index]);
}

function diffRows(oldRow: Row, newRow: Row): Row {
  return COLUMNS.map((_, index) => newRow[index] - oldRow[index]);
}

function zeroRow(): Row {
  return COLUMNS.map(() => 0n);
}

function totals(snapshot: Snapshot): Row {
  let total = zeroRow();
  for (const row of snapshot.values()) {
    total = addRows(total, row);
  }
  return total;
}

function main() {
  const oldSnapshot = parseSnapshot(readCommittedDataJson());
  const newSnapshot = parseSnapshot(readFileSync("data.json", "utf-8"));
  const allAddresses = new Set([...oldSnapshot.keys(), ...newSnapshot.keys()]);

  const newAddresses: string[] = [];
  const removedAddresses: string[] = [];
  const changedRows: Array<{
    address: string;
    deltaTotal: bigint;
    impact: bigint;
    delta: Row;
  }> = [];

  for (const address of allAddresses) {
    const oldRow = oldSnapshot.get(address);
    const newRow = newSnapshot.get(address);

    if (!oldRow && newRow) newAddresses.push(address);
    if (oldRow && !newRow) removedAddresses.push(address);

    const delta = diffRows(oldRow ?? zeroRow(), newRow ?? zeroRow());
    const impact = delta.reduce((total, value) => total + abs(value), 0n);

    if (impact > 0n) {
      changedRows.push({
        address,
        deltaTotal: sumRow(newRow ?? zeroRow()) - sumRow(oldRow ?? zeroRow()),
        impact,
        delta,
      });
    }
  }

  const oldTotals = totals(oldSnapshot);
  const newTotals = totals(newSnapshot);
  const totalDeltas = diffRows(oldTotals, newTotals);

  console.log("Snapshot diff: HEAD:data.json -> data.json");
  console.table([
    {
      metric: "rows",
      old: oldSnapshot.size.toString(),
      new: newSnapshot.size.toString(),
      delta: (newSnapshot.size - oldSnapshot.size).toString(),
    },
    {
      metric: "new addresses",
      old: "",
      new: newAddresses.length.toString(),
      delta: `+${newAddresses.length}`,
    },
    {
      metric: "removed addresses",
      old: "",
      new: removedAddresses.length.toString(),
      delta: `-${removedAddresses.length}`,
    },
    {
      metric: "changed rows",
      old: "",
      new: changedRows.length.toString(),
      delta: changedRows.length.toString(),
    },
  ]);

  console.log("Column totals");
  console.table(
    COLUMNS.map((column, index) => ({
      column,
      old: formatUnits(oldTotals[index]),
      new: formatUnits(newTotals[index]),
      delta: formatUnits(totalDeltas[index]),
    }))
  );

  console.log("Top changed addresses by absolute column movement");
  console.table(
    changedRows
      .sort((a, b) => (a.impact === b.impact ? 0 : a.impact > b.impact ? -1 : 1))
      .slice(0, 20)
      .map((row) => ({
        address: row.address,
        deltaTotal: formatUnits(row.deltaTotal),
        impact: formatUnits(row.impact),
        ...Object.fromEntries(
          COLUMNS.map((column, index) => [
            column,
            formatUnits(row.delta[index]),
          ])
        ),
      }))
  );

  if (newAddresses.length > 0) {
    console.log("New addresses");
    console.table(newAddresses.slice(0, 50).map((address) => ({ address })));
  }

  if (removedAddresses.length > 0) {
    console.log("Removed addresses");
    console.table(removedAddresses.slice(0, 50).map((address) => ({ address })));
  }
}

main();
