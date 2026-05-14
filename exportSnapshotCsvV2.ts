import { readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { blockNumber } from "./index";
import OTCData from "./OTCData";

const INPUT_FILE = "data.json";
const OUTPUT_FILE = `snapshot-${blockNumber}-v2.csv`;
const CONTRACT_CHECK_FILE = "contract_check_progressv2.json";
const OTC_DECIMALS = 8;

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

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

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
  const fraction = (absolute % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}

function toScaledAmount(value: number | string, decimals = OTC_DECIMALS) {
  const valueString = value.toString();

  if (valueString.includes("e")) {
    return toScaledAmount(Number(value).toFixed(decimals), decimals);
  }

  const sign = valueString.startsWith("-") ? -1n : 1n;
  const unsignedValue = valueString.replace(/^-/, "");
  const [integerPart, fractionPart = ""] = unsignedValue.split(".");
  const paddedFraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);

  return sign * (BigInt(integerPart) * 10n ** BigInt(decimals) + BigInt(paddedFraction));
}

function formatScaledAmount(value: bigint, decimals = OTC_DECIMALS) {
  return formatUnits(value, decimals);
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
        addressTypes.set(normalizeAddress(address), type);
      }
    }

    return addressTypes;
  } catch {
    return new Map<string, "contract" | "eoa">();
  }
}

function loadOtcByAddress() {
  const otcByAddress = new Map<string, bigint>();

  for (const event of OTCData) {
    if (event.amount <= 0) continue;

    const address = normalizeAddress(event.fromAddress);
    const amount = toScaledAmount(event.amount);

    otcByAddress.set(address, (otcByAddress.get(address) ?? 0n) + amount);
  }

  return otcByAddress;
}

const snapshot = JSON.parse(readFileSync(INPUT_FILE, "utf-8")) as SnapshotData;
const addressTypes = loadAddressTypes();
const otcByAddress = loadOtcByAddress();
const rowsByAddress = new Map<string, Array<string | number | bigint | null>>();
const snapshotAddresses = new Set(Object.keys(snapshot).map(normalizeAddress));

for (const [address, values] of Object.entries(snapshot)) {
  rowsByAddress.set(normalizeAddress(address), values);
}

for (const address of otcByAddress.keys()) {
  if (!rowsByAddress.has(address)) {
    rowsByAddress.set(address, []);
  }
}

const headers = [
  "Address",
  "Account Type",
  ...COMPONENTS.map(([, label]) => label),
  "OTC",
  "Total",
];

let otcMatchedAddresses = 0;
let otcOnlyAddresses = 0;
let otcTotal = 0n;

const rows = Array.from(rowsByAddress.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([address, values]) => {
    const componentValues = COMPONENTS.map((_, index) => toBigIntValue(values[index]));
    const total = componentValues.reduce((sum, value) => sum + value, 0n);
    const otc = otcByAddress.get(address) ?? 0n;
    const checksumAddress = getAddress(address);
    const accountType = addressTypes.get(address) ?? "unknown";

    if (otc > 0n) {
      otcTotal += otc;
      if (snapshotAddresses.has(address)) {
        otcMatchedAddresses++;
      } else {
        otcOnlyAddresses++;
      }
    }

    return [
      checksumAddress,
      accountType,
      ...componentValues.map((value) => formatUnits(value)),
      formatScaledAmount(otc),
      formatUnits(total),
    ];
  });

const csv = [
  headers.map(csvEscape).join(","),
  ...rows.map((row) => row.map(csvEscape).join(",")),
].join("\n");

writeFileSync(OUTPUT_FILE, `${csv}\n`, "utf-8");

console.log(`wrote ${rows.length} rows to ${OUTPUT_FILE}`);
console.log(`OTC total: ${formatScaledAmount(otcTotal)}`);
console.log(`OTC addresses matched snapshot: ${otcMatchedAddresses}`);
console.log(`OTC-only addresses added: ${otcOnlyAddresses}`);
