import { Client } from "pg";
import { fsBLPAbi } from "./ABI";
import { chunkedMulticall, relu } from "./utils";
import { AccountList, addresses, ColIndex, defaultValue } from ".";

export async function fillfsBLP() {
  console.log("fillFSBLP");
  let total = 0n;
  const resp = await chunkedMulticall(
    [...AccountList.keys()].map((r) => {
      return {
        address: addresses.fsBLP,
        abi: fsBLPAbi,
        functionName: "claimable",
        args: [r],
      } as const;
    })
  );
  resp.map((s) => {
    let resp = AccountList.get(s.args[0]) || [...defaultValue];
    resp[ColIndex.BLPRewardAsEsBfr] = relu(s.result);
    total += resp[ColIndex.BLPRewardAsEsBfr];
    AccountList.set(s.args[0], [...resp]);
  });
  return total;
}
