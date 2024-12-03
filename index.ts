import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getContract,
  http,
  type ContractFunctionParameters,
} from "viem";
import type { ApiResponse } from "./types";
import { arbitrum } from "viem/chains";
import { fsBLPAbi, vesterAbi } from "./ABI";
import { getUserWiseVestingEvents, indexToEvent } from "./vester";

const axios = require("axios");
export const blockNumber = 280607605;
function blockLimit() {
  return blockNumber.toString();
}
function limit() {
  return "LIMIT 100000";
}
const unsafeMode = true;

const BFRAddress = "0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d";
const esBFRAddress = "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a";
const BLPAddress = "0x6Ec7B10bF7331794adAaf235cb47a2A292cD9c7e";
const fsBLP = "0x7d1d610Fe82482412842e8110afF1cB72FA66bc8";
const addresses = {
  vesterV1: "0x92f424a2A65efd48ea57b10D345f4B3f2460F8c8",
  vesterV2: "0xF454b87b3DbE726157173A331234fE2d353DB0Dc",
} as const;
async function getTokenHolderList(token: Address) {
  const resoonse: { data: ApiResponse } = await axios.post(
    "https://api.transpose.io/sql",
    {
      sql: `SELECT data,topic_0,topic_1,topic_2 FROM arbitrum.logs WHERE address = '${token}' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' AND block_number <= ${blockLimit()} ${limit()};`,
      parameters: {},
      options: {},
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25",
      },
    }
  );
  return resoonse;
}
export const arbitrumClient = createPublicClient({
  transport: http(),
  chain: arbitrum,
});
const BFRContract = getContract({
  address: BFRAddress,
  abi: erc20Abi,
  client: arbitrumClient,
});
const esBFRContract = getContract({
  address: BFRAddress,
  abi: erc20Abi,
  client: arbitrumClient,
});
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
type Address = `0x${string}`;
const AccountList = new Map<Address, Array<bigint>>();
enum ColIndex {
  RawBFR,
  RawEsBFR,
  BLPRewardAsEsBfr,
  UnclaimedVester1,
  UnclaimedVester2,
  Staking,
}
const defaultValue = new Array(6).fill(0n);
async function fillAccounts(responses: Array<{ data: ApiResponse }>) {
  responses.forEach((resp) =>
    resp.data.results.forEach((s) => {
      const decodedEvent = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: s.data,
        topics: [s.topic_0, s.topic_1, s.topic_2],
      });
      AccountList.set(decodedEvent.args.from, defaultValue);
      AccountList.set(decodedEvent.args.to, defaultValue);
      // console.log(decodedEvent)
    })
  );
}

async function getData(calls: Array<ContractFunctionParameters>) {
  return (
    await arbitrumClient.multicall({
      contracts: calls,
    })
  ).map((val, index) => ({ ...calls[index], data: val.result }));
}
function getRawBalanceCalls(token: `0x${string}`) {
  let calls: Array<ContractFunctionParameters> = [];
  for (const [account, values] of AccountList.entries()) {
    calls.push({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account] as const,
    });
  }
  return calls;
}
async function fillRawBalanceCols() {
  let bfrBalances = await getData(getRawBalanceCalls(BFRAddress));
  for (const data of bfrBalances) {
    if (!data.args) continue;
    let value = AccountList.get(data.args[0] as Address)!;
    value[ColIndex.RawBFR] = data.data as bigint;
    AccountList.set(data.args[0]! as Address, value);
  }
  let esBfrBalances = await getData(getRawBalanceCalls(esBFRAddress));
  for (const data of esBfrBalances) {
    if (!data.args) continue;
    let value = AccountList.get(data.args[0] as Address)!;
    value[ColIndex.RawEsBFR] = data.data as bigint;
    AccountList.set(data.args[0]! as Address, value);
  }
}
async function fillBLPesBFRrewards() {
  const calls: Array<
    ContractFunctionParameters<typeof fsBLPAbi> & { data?: bigint }
  > = [];
  for (const account of AccountList.keys()) {
    calls.push({
      address: fsBLP,
      abi: fsBLPAbi,
      functionName: "claimable",
      args: [account],
    });
  }
  const resp = await getData(calls);
  console.log(
    "resp",
    resp.map((r) => r.data)
  );
  for (const data of resp) {
    if (!data.args) continue;
    let value = AccountList.get(data.args[0] as Address)!;
    value[ColIndex.BLPRewardAsEsBfr] = data.data as bigint;
    AccountList.set(data.args[0]! as Address, value);
  }
}
async function fillVester(vesterAddress: Address) {
  const [dposits, withdraws, claims] = await getUserWiseVestingEvents(
    vesterAddress
  );
  const vesterMap = new Map<Address, bigint>();
  // add deposits
  dposits.data.results.forEach((s) => {
    const decodedEvent = decodeEventLog({
      abi: vesterAbi,
      eventName: "Deposit",
      data: s.data,
      topics: [s.topic_0, s.topic_1, s.topic_2],
    });
    const accountRes = vesterMap.get(decodedEvent.args.account);
    if (accountRes) {
      vesterMap.set(
        decodedEvent.args.account,
        decodedEvent.args.amount + accountRes
      );
    } else {
      vesterMap.set(decodedEvent.args.account, decodedEvent.args.amount);
    }
  });
  // remove withdraws
  withdraws.data.results.forEach((s) => {
    const decodedEvent = decodeEventLog({
      abi: vesterAbi,
      eventName: "Withdraw",
      data: s.data,
      topics: [s.topic_0, s.topic_1, s.topic_2],
    });
    const accountRes = vesterMap.get(decodedEvent.args.account);
    if (accountRes) {
      vesterMap.set(
        decodedEvent.args.account,
        accountRes - decodedEvent.args.balance
      );
    } else {
      if (!unsafeMode) {
        throw new Error("Withdraw wo deposit");
      }
      vesterMap.set(decodedEvent.args.account, decodedEvent.args.balance);
    }
  });
  //   remove claims
  claims.data.results.forEach((s) => {
    const decodedEvent = decodeEventLog({
      abi: vesterAbi,
      eventName: "Claim",
      data: s.data,
      topics: [s.topic_0, s.topic_1, s.topic_2],
    });
    const accountRes = vesterMap.get(decodedEvent.args.receiver);
    if (accountRes) {
      vesterMap.set(
        decodedEvent.args.receiver,
        accountRes - decodedEvent.args.amount
      );
    } else {
      if (!unsafeMode) {
        throw new Error("Claim wo deposit");
      }
      vesterMap.set(decodedEvent.args.receiver, decodedEvent.args.amount);
    }
  });
  // add column in final map
  for (const [address, bal] of vesterMap.entries()) {
    let ip = defaultValue;
    const entry = AccountList.get(address);
    if (entry) ip = entry;
    ip[ColIndex.UnclaimedVester1] = bal;
    AccountList.set(address, ip);
  }
}

async function main() {
  const bfrResponse: { data: ApiResponse } = await getTokenHolderList(
    BFRAddress
  );
  await sleep(2000);
  const esBfrResponse: { data: ApiResponse } = await getTokenHolderList(
    esBFRAddress
  );
  await sleep(2000);
  const blpResponse: { data: ApiResponse } = await getTokenHolderList(
    BLPAddress
  );
  fillAccounts([bfrResponse, esBfrResponse, blpResponse]);
  fillRawBalanceCols();
  fillBLPesBFRrewards();
  fillVester(addresses.vesterV1);
  fillVester(addresses.vesterV2);
}

main();
