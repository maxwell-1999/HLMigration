import { Client } from "pg";
import { fsBLPAbi } from "./ABI";
import { chunkedMulticall } from "./utils";
import { AccountList, addresses, ColIndex, defaultValue } from ".";
import { erc20Abi } from "viem";

export async function fillRaw() {
  console.log("FillRaw");
  const accounts = [...AccountList.keys()];
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
  resp.forEach((res) => {
    let value = AccountList.get(res.args[0]) || [...defaultValue];
    value[ColIndex.RawBFR] = res.result as bigint;

    AccountList.set(res.args[0], [...value]);
  });
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

    value[ColIndex.RawEsBFR] = res.result as bigint;
    AccountList.set(res.args[0], [...value]);
  });
}
// console.log(AccountList.size);

//
