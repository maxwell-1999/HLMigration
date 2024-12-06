import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  http,
  type ContractFunctionParameters,
} from "viem";
import type { ApiResponse } from "./types";
import { arbitrum } from "viem/chains";
import { fsBLPAbi, vesterAbi } from "./ABI";
import { getUserWiseVestingEvents, indexToEvent } from "./vester";
import { fillRaw } from "./BFR";
import { Client } from "pg";
import { fillStaking } from "./staking";
import { fillfsBLP } from "./fsBLP";
import { convertMapToJson } from "./utils";

export const blockNumber = 280607605;
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
}
export const defaultValue = new Array(6).fill(0);

export const AccountList = new Map<Address, Array<bigint>>();

export const addresses = {
  vesterV1: "0x92f424a2A65efd48ea57b10D345f4B3f2460F8c8",
  vesterV2: "0xF454b87b3DbE726157173A331234fE2d353DB0Dc",
  sbfBFR: "0xBABF696008DDAde1e17D302b972376B8A7357698",
  sBFR: "0x173817f33f1c09bcb0df436c2f327b9504d6e067",
  esBFR: "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a",
  blp: "0x6Ec7B10bF7331794adAaf235cb47a2A292cD9c7e",
  bfr: "0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d",
  fsBLP: "0x7d1d610Fe82482412842e8110afF1cB72FA66bc8",
  sbBFR: "0x00B88B6254B51C7b238c4675E6b601a696CC1aC8",
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
  const vesterList = await destinationClient.query(`SELECT * FROM "vester"`);
  console.log(`${vesterList.rowCount} vesters fetched`);
  vesterList.rows.map((r) => {
    let oldValue = [...defaultValue];
    oldValue[ColIndex.UnclaimedVester1] = r.v1balance;
    oldValue[ColIndex.UnclaimedVester2] = r.v2balance;
    AccountList.set(r.address, [...defaultValue]);
  });
}

async function main() {
  await fillHoldersAndVesters();
  await fillRaw();
  await fillfsBLP();
  await fillStaking();
  convertMapToJson(AccountList);
}
console.time("main");
await main();
console.timeEnd("main");
