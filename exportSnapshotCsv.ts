import { readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { blockNumber } from "./index";

const INPUT_FILE = "data.json";
const OUTPUT_FILE = `snapshot-${blockNumber}.csv`;
const CONTRACT_CHECK_FILE = "contract_check_progressv2.json";

const COMPONENTS = [
  ["raw_bfr", "Raw BFR"],
  ["raw_esbfr", "Raw esBFR"],
  ["fsblp", "fsBLP Reward"],
  ["vester1", "Vester 1"],
  ["vester2", "Vester 2"],
  ["staking", "Staking"],
  ["camelot", "Camelot"],
] as const;

type SnapshotData = Record<string, Array<string | number | bigint | null>>;
type ContractCheckData = Record<string, Record<string, "contract" | "eoa">>;

function toBigIntValue(value: string | number | bigint | null | undefined) {
  if (value == null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  return BigInt(Math.trunc(value));
}

function formatUnits(value: bigint, decimals = 18) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const integer = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "");

  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}

function csvEscape(value: string | bigint) {
  const stringValue = value.toString();
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function loadAddressTypes() {
  try {
    const parsed = JSON.parse(readFileSync(CONTRACT_CHECK_FILE, "utf-8")) as ContractCheckData;
    const addressTypes = new Map<string, "contract" | "eoa">();

    for (const batch of Object.values(parsed)) {
      for (const [address, type] of Object.entries(batch)) {
        addressTypes.set(address.toLowerCase(), type);
      }
    }

    return addressTypes;
  } catch {
    return new Map<string, "contract" | "eoa">();
  }
}

const snapshot = JSON.parse(readFileSync(INPUT_FILE, "utf-8")) as SnapshotData;
const addressTypes = loadAddressTypes();

const headers = [
  "address",
  "account_type",
  ...COMPONENTS.flatMap(([key, label]) => [`${key}_wei`, label]),
  "total_wei",
  "Total",
];

const rows = Object.entries(snapshot)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([address, values]) => {
    const componentValues = COMPONENTS.map((_, index) => toBigIntValue(values[index]));
    const total = componentValues.reduce((sum, value) => sum + value, 0n);
    const checksumAddress = getAddress(address);
    const accountType = addressTypes.get(address.toLowerCase()) ?? "unknown";

    return [
      checksumAddress,
      accountType,
      ...componentValues.flatMap((value) => [value.toString(), formatUnits(value)]),
      total.toString(),
      formatUnits(total),
    ];
  });

const csv = [
  headers.map(csvEscape).join(","),
  ...rows.map((row) => row.map(csvEscape).join(",")),
].join("\n");

writeFileSync(OUTPUT_FILE, `${csv}\n`, "utf-8");

console.log(`wrote ${rows.length} rows to ${OUTPUT_FILE}`);
