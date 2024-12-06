import type { ContractFunctionParameters } from "viem";
import { sbfBFRAbi, sBFRAbi } from "./ABI";
import { AccountList, addresses, ColIndex, defaultValue } from ".";
import { chunkedMulticall } from "./utils";

export async function fillStaking() {
  console.log("Staking");
  const currentHolderList = [...AccountList.keys()];
  // console.log(currentHolderList);
  const stakedBalanceCalls = currentHolderList.map((s) => {
    return {
      address: addresses.sbfBFR,
      abi: sbfBFRAbi,
      functionName: "depositBalances",
      args: [s, addresses.sbBFR],
    } as ContractFunctionParameters<typeof sBFRAbi>;
  });

  const claimableCalls = currentHolderList.map((s) => {
    return {
      address: addresses.sBFR,
      abi: sBFRAbi,
      functionName: "claimable",
      args: [s],
    } as ContractFunctionParameters<typeof sBFRAbi>;
  });

  const stakedBalances = await chunkedMulticall(stakedBalanceCalls);
  const claimableBalances = await chunkedMulticall(claimableCalls);
  stakedBalances.forEach((ele, index) => {
    let oldValue = AccountList.get(ele.args[0]) || [...defaultValue];

    if (
      typeof ele.result == "bigint" &&
      typeof claimableBalances[index].result == "bigint"
    ) {
      oldValue[ColIndex.Staking] = ele.result + claimableBalances[index].result;
    } else {
      console.log("found wrong", ele, claimableBalances[index]);
    }
    AccountList.set(ele.args[0], oldValue);
  });
}
