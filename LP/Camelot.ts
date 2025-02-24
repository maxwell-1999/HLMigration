import { AccountList, addresses, ColIndex, defaultValue } from "..";
import { CamelotAbi } from "../ABI";
import { alchemyClient, chunkedMulticall, relu } from "../utils";

export async function fillCamelot() {
  const accountList = [...AccountList.keys()];
  const readCalls = accountList.map((s) => ({
    address: addresses.camelot,
    abi: CamelotAbi,
    functionName: "balanceOf",
    args: [s],
  }));
  const [reserve0, reserve1] = await alchemyClient.readContract({
    address: addresses.camelot,
    abi: CamelotAbi,
    functionName: "getReserves",
  });
  const camelotBFR = await alchemyClient.readContract({
    address: addresses.bfr,
    abi: CamelotAbi,
    functionName: "balanceOf",
    args: [addresses.camelot],
  });
  const totalSupply = await alchemyClient.readContract({
    address: addresses.camelot,
    abi: CamelotAbi,
    functionName: "totalSupply",
  });
  let total = 0n;
  const calls = await chunkedMulticall(readCalls);
  calls.forEach((c) => {
    const lpBalance = c.result;
    // if (c.result > 0n) console.log(c.result);
    const bfrAmount = (camelotBFR * lpBalance) / totalSupply;
    let value = AccountList.get(c.args[0]) || [...defaultValue];
    value[ColIndex.Camelot] = relu(bfrAmount) as bigint;
    total += lpBalance;
    AccountList.set(c.args[0], [...value]);
  });
  console.log(`User $combined have ${total} tokens`);
  return total;
}
