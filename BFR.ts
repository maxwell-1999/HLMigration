import { Client } from "pg";
import { fsBLPAbi } from "./ABI";
import { chunkedMulticall, relu } from "./utils";
import { AccountList, addresses, ColIndex, defaultValue } from ".";
import { erc20Abi } from "viem";

export async function fillRaw() {
  console.log("FillRaw");
  const accounts = [...AccountList.keys()];
  let total = 0n;

  const resp = await chunkedMulticall(
    accounts.map((r) => {
      return {
        address: addresses.bfr,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [r],
      } as const;
    })
  );
  let maxAccount = ["", 0n];
  resp.forEach((res) => {
    let value = AccountList.get(res.args[0]) || [...defaultValue];
    value[ColIndex.RawBFR] = relu(res.result) as bigint;
    total += value[ColIndex.RawBFR];
    if (value[ColIndex.RawBFR] > maxAccount[1]) {
      maxAccount = [res.args[0], value[ColIndex.RawBFR]];
    }
    AccountList.set(res.args[0], [...value]);
  });
  console.log(maxAccount);
  let BFR = total;
  // total = 0n;
  const esBFRresp = await chunkedMulticall(
    accounts.map((r) => {
      return {
        address: addresses.esBFR,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [r],
      } as const;
    })
  );
  let log = 3;
  esBFRresp.forEach((res) => {
    let value = AccountList.get(res.args[0]) || [...defaultValue];
    value[ColIndex.RawEsBFR] = relu(res.result) as bigint;
    total += value[ColIndex.RawEsBFR];
    AccountList.set(res.args[0], [...value]);
  });
  console.log(total);
  return total;
}
// console.log(AccountList.size);

//
