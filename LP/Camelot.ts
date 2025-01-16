import { AccountList, addresses } from "..";
import { CamelotAbi } from "../ABI";
import { alchemyClient, chunkedMulticall } from "../utils";

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
  const totalSupply = await alchemyClient.readContract({
    address: addresses.camelot,
    abi: CamelotAbi,
    functionName: "totalSupply",
  });
  let total = 0n;
  const calls = await chunkedMulticall(readCalls);
  calls.forEach((c) => {
    const lpBalance = c.result;
    if (lpBalance == 0n) return;
    console.log(reserve0, lpBalance, totalSupply);
    // Calculate your share of each token in the pool
    const token0Amount = (reserve0 * lpBalance) / totalSupply;
    total += token0Amount;
    // const token1Amount = (reserve1 * lpBalance) / totalSupply;
  });
  console.log(`User $combined have ${total} tokens`);
  //   console.log(
  //     calls.filter((c) => {
  //       console.log(c.result);
  //       return c.result > 0n;
  //     })
  //   );
}
