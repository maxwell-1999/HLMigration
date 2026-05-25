#!/usr/bin/env bun

import { privateKeyToAccount } from "viem/accounts";

function usage() {
  console.error(`Usage:
  bun run pkToAddress.ts <private-key>
  PRIVATE_KEY=<private-key> bun run pkToAddress.ts
  printf '%s' '<private-key>' | bun run pkToAddress.ts

Private key format: 32-byte hex, with or without 0x prefix.`);
}

function normalizePrivateKey(value: string): `0x${string}` {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("invalid private key");
  }

  return `0x${hex}` as `0x${string}`;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

const arg = Bun.argv[2];

if (arg === "-h" || arg === "--help") {
  usage();
  process.exit(0);
}

const rawPrivateKey = arg ?? process.env.PRIVATE_KEY ?? (await readStdin());

if (!rawPrivateKey.trim()) {
  usage();
  process.exit(1);
}

try {
  const privateKey = normalizePrivateKey(rawPrivateKey);
  const account = privateKeyToAccount(privateKey);
  console.log(account.address);
} catch {
  console.error("Invalid private key: expected a 32-byte hex string.");
  process.exit(1);
}
