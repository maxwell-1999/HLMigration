import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  http,
  type ContractFunctionParameters,
} from "viem";
const fs = require("fs");

import type { ApiResponse } from "./types";
import { arbitrum } from "viem/chains";
import { fsBLPAbi, vesterAbi } from "./ABI";
import { getUserWiseVestingEvents, indexToEvent } from "./vester";
import { fillRaw } from "./BFR";
import { Client } from "pg";
import { fillStaking } from "./staking";
import { fillfsBLP } from "./fsBLP";
import {
  alchemyClient,
  bigintToFloat,
  calculateSum,
  chunkedMulticall,
  convertMapToJson,
  dumpToJSON,
  relu,
} from "./utils";
import { fillCamelot } from "./LP/Camelot";
import { sleep } from "bun";

export const blockNumber = 297628091;
export function blockLimit(notAnd?: boolean) {
  return "";
}

type Address = `0x${string}`;
export enum ColIndex {
  RawBFR,
  RawEsBFR,
  BLPRewardAsEsBfr,
  UnclaimedVester1,
  UnclaimedVester2,
  Staking,
  Camelot,
}
export const defaultValue = new Array(7).fill(0);

export const AccountList = new Map<Address, Array<bigint>>();

export const addresses = {
  vesterV1: "0x92f424a2A65efd48ea57b10D345f4B3f2460F8c8",
  vesterV2: "0xF454b87b3DbE726157173A331234fE2d353DB0Dc",
  sbfBFR: "0xBABF696008DDAde1e17D302b972376B8A7357698",
  sBFR: "0x173817f33f1c09bcb0df436c2f327b9504d6e067",
  esBFR: "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a",
  blp: "0x6Ec7B10bF7331794adAaf235cb47a2A292cD9c7e",
  bfr: "0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d",
  camelot: "0x47ECF602a62BaF7d4e6b30FE3E8dD45BB8cfFadc",
  bfrWethGamma: "0x1E86A593E55215957C4755f1BE19a229AF3286f6",
  bfrwethNFTPosManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  bfrwethPool: "0xB529f885260321729D9fF1C69804c5Bf9B3a95A5",
  fsBLP: "0x7d1d610Fe82482412842e8110afF1cB72FA66bc8",
  sbBFR: "0x00B88B6254B51C7b238c4675E6b601a696CC1aC8",
  // camelotAddresses:{
  //   positionHelper:"0xe458018Ad4283C90fB7F5460e24C4016F81b8175",
  //   router:"0xc873fEcbd354f5A56E00E710B90EF4201db2448d"
  // }
} as const;

// async function fillVester(vesterAddress: Address) {
//   const [dposits, withdraws, claims] = await getUserWiseVestingEvents(
//     vesterAddress
//   );
//   const vesterMap = new Map<Address, bigint>();
//   // add deposits
//   dposits.data.results.forEach((s) => {
//     const decodedEvent = decodeEventLog({
//       abi: vesterAbi,
//       eventName: "Deposit",
//       data: s.data,
//       topics: [s.topic_0, s.topic_1, s.topic_2],
//     });
//     const accountRes = vesterMap.get(decodedEvent.args.account);
//     if (accountRes) {
//       vesterMap.set(
//         decodedEvent.args.account,
//         decodedEvent.args.amount + accountRes
//       );
//     } else {
//       vesterMap.set(decodedEvent.args.account, decodedEvent.args.amount);
//     }
//   });
//   // remove withdraws
//   withdraws.data.results.forEach((s) => {
//     const decodedEvent = decodeEventLog({
//       abi: vesterAbi,
//       eventName: "Withdraw",
//       data: s.data,
//       topics: [s.topic_0, s.topic_1, s.topic_2],
//     });
//     const accountRes = vesterMap.get(decodedEvent.args.account);
//     if (accountRes) {
//       vesterMap.set(
//         decodedEvent.args.account,
//         accountRes - decodedEvent.args.balance
//       );
//     } else {
//       if (!unsafeMode) {
//         throw new Error("Withdraw wo deposit");
//       }
//       vesterMap.set(decodedEvent.args.account, decodedEvent.args.balance);
//     }
//   });
//   //   remove claims
//   claims.data.results.forEach((s) => {
//     const decodedEvent = decodeEventLog({
//       abi: vesterAbi,
//       eventName: "Claim",
//       data: s.data,
//       topics: [s.topic_0, s.topic_1, s.topic_2],
//     });
//     const accountRes = vesterMap.get(decodedEvent.args.receiver);
//     if (accountRes) {
//       vesterMap.set(
//         decodedEvent.args.receiver,
//         accountRes - decodedEvent.args.amount
//       );
//     } else {
//       if (!unsafeMode) {
//         throw new Error("Claim wo deposit");
//       }
//       vesterMap.set(decodedEvent.args.receiver, decodedEvent.args.amount);
//     }
//   });
//   // add column in final map
//   for (const [address, bal] of vesterMap.entries()) {
//     let ip = defaultValue;
//     const entry = AccountList.get(address);
//     if (entry) ip = entry;
//     ip[ColIndex.UnclaimedVester1] = bal;
//     AccountList.set(address, ip);
//   }
// }

const destinationConnectionString =
  "postgresql://postgres:mDQFJnINYpbGQLldxJTiMrQgxjklxoCU@autorack.proxy.rlwy.net:19093/railway";
const destinationClient = new Client({
  connectionString: destinationConnectionString,
});
await destinationClient.connect();
async function fillHoldersAndVesters() {
  console.log("Fetching users");
  const accounts = await destinationClient.query(`SELECT * FROM "account"`);
  console.log(`${accounts.rowCount} users fetched`);
  accounts.rows.map((r) => {
    AccountList.set(r.address, [...defaultValue]);
  });
  let total = 0n;
  const vesterList = await destinationClient.query(`SELECT * FROM "vester"`);
  console.log(`${vesterList.rowCount} vesters fetched`);
  vesterList.rows.map((r) => {
    let oldValue = [...defaultValue];
    oldValue[ColIndex.UnclaimedVester1] = relu(r.v1balance);
    oldValue[ColIndex.UnclaimedVester2] = relu(r.v2balance);
    // console.log(typeof relu(r.v1balance), typeof relu(r.v2balance));
    total +=
      oldValue[ColIndex.UnclaimedVester1] + oldValue[ColIndex.UnclaimedVester2];
    AccountList.set(r.address, [...oldValue]);
  });
  return total;
}

async function main() {
  const ves = await fillHoldersAndVesters();
  console.log(`users for vesters have total ${ves} BFRs+esBFRs`);
  // const camelot = await fillCamelot();
  const raw = await fillRaw();
  const fs = await fillfsBLP();
  const ss = await fillStaking();
  let total = 0n;
  convertMapToJson(AccountList);
  // for (let acc in AccountList) {
  //   const tota = AccountList.get(acc as Address)!.reduce((prev, curr) => {
  //     return relu(prev) + relu(curr);
  //   }, 0n);
  //   total += tota;
  // }
  console.log(`users have raw total ${bigintToFloat(raw)} BFRs+esBFRs`);
  console.log(`users has total ${bigintToFloat(fs)} BFRs+esBFRs as BLP reward`);
  console.log(`users has total ${bigintToFloat(ss)} BFRs+esBFRs as staked`);
  console.log(`overall ${bigintToFloat(total)} BFRs+esBFRs are there`);
}
console.time("main");
// await main();
async function fillContracts() {
  const jsonFilePath = "./data.json"; // Replace with your JSON file path
  const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));
  Object.keys(jsonData).forEach(async (address) => {
    const calls = Object.keys(jsonData)
      .slice(0, 10)
      .map((address) => ({
        address: address as `0x${string}`,
        abi: [
          {
            name: "getCode",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "address", type: "address" }],
            outputs: [{ name: "code", type: "bytes" }],
          },
        ],
        functionName: "getCode",
        args: [],
      }));
    const results = await chunkedMulticall([
      {
        address: "0x6Ec7B10bF7331794adAaf235cb47a2A292cD9c7e",
        abi: [
          {
            name: "getCode",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "address", type: "address" }],
            outputs: [{ name: "code", type: "bytes" }],
          },
        ],
        functionName: "getCode",
        args: [],
      },
    ]);
    results.forEach((result: { result: string }, index: number) => {
      const address = calls[index].address;
      console.log(result.result);
      // If bytecode exists (not null and not '0x'), it's a contract
      if (result.result && result.result !== "0x") {
        console.log(`${address} is a contract`);
      }
    });
  });
}

async function checkContract() {
  const CHECKPOINT_FILE = "./contract_check_progressv2.json";
  const addresses = JSON.parse(fs.readFileSync("./data.json", "utf-8"));
  const addressList = Object.keys(addresses);
  const batchSize = 1000;

  // Load existing results if any

  console.log("Need to process", addressList.length / batchSize, "batches");
  let results: Record<number, any[]> = {};
  for (let i = 0; i < addressList.length; i += batchSize) {
    let completedBatches = JSON.parse(
      fs.readFileSync(CHECKPOINT_FILE, "utf-8")
    );
    if (completedBatches[i]) {
      results[i] = completedBatches[i];
      console.log(`cached for ${i} to ${i + batchSize}`);
      continue;
    }

    const batch = addressList.slice(i, i + batchSize);
    console.log(`processing ${i} to ${i + batchSize}`);
    const batchPromises = batch.map((address) => {
      return alchemyClient.getCode({
        address: address as `0x${string}`,
      });
    });
    const batchResults = await Promise.all(batchPromises);

    // Fix the reduce function with proper typing
    results[i] = batchResults.reduce(
      (acc: Record<string, string>, code: string, index: number) => {
        acc[batch[index]] = code == null ? "eoa" : "contract";
        return acc;
      },
      {}
    );

    await sleep(1000);
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(results, null, 2));
    console.log(`Completed batch ${Math.floor(i / batchSize) + 1}`);
  }

  return results;
}
// await fillContracts();

async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 300,
  delayMs: number = 5000
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      retryCount++;
      console.error(`Error in attempt ${retryCount}/${maxRetries}:`, error);

      if (retryCount >= maxRetries) {
        console.error(`Failed after ${maxRetries} attempts. Giving up.`);
        throw error;
      }

      console.log(`Retrying in ${delayMs / 1000} seconds...`);
      await sleep(delayMs);
    }
  }
}

// await retryWithDelay(() => checkContract());
await main();
// convert to csv
// see changes
// apply conditional formatting + add contracts (optional)
console.timeEnd("main");
