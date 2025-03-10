import { sleep } from "bun";
import { createPublicClient, erc20Abi, http } from "viem";
import { arbitrum } from "viem/chains";
// import { alchemyClient } from "./utils";
const alchemyClient = createPublicClient({
  transport: http(
    "https://arb-mainnet.g.alchemy.com/v2/q8y6_aaOKZM4M30JUe0GYpWTVsOZ2au2"
  ),
  chain: arbitrum,
});
const MAX_BATCH_SIZE = 500;
export const blockNumber = 280607605;

export const chunkedMulticall = async (calls: any[]) => {
  let start = 0;
  let end = MAX_BATCH_SIZE;
  let chunked = [];
  const sz = calls.length;
  // Create chunks
  while (start < calls.length) {
    chunked.push(calls.slice(start, end));
    start = end;
    end += MAX_BATCH_SIZE;
  }
  let results: any[] = [];
  let callNumber = 1;
  // Sequentially execute multicalls using for await...of
  // console.log(
  //   `fetching ${calls.length} calls in chunk of size ${MAX_BATCH_SIZE}`
  // );
  for await (const chunk of chunked) {
    try {
      const res = await alchemyClient.multicall({
        contracts: chunk,
        blockNumber: BigInt(blockNumber),
      });
      results = [
        ...results,
        ...res.map((r: any, i: any) => ({
          ...r,
          ...{ ...chunk[i], abi: null },
        })),
      ];
      console.log(`-`);
      await sleep(1000); // Pause for 1 second between calls
    } catch (e) {
      console.log(e);
    }
    // break;
  }
  return results;
};
async function calculateTotalSupply() {
  // const totalSupply = await alchemyClient.readContract({
  //   address: "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a",
  //   abi: erc20Abi,
  //   functionName: "totalSupply",
  //   args: [],
  // });
  const res = await chunkedMulticall([
    {
      address: "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a",
      abi: erc20Abi,
      functionName: "totalSupply",
      args: [],
    },
    {
      address: "0x92914A456EbE5DB6A69905f029d6160CF51d3E6a",
      abi: erc20Abi,
      functionName: "decimals",
      args: [],
    },
  ]);
  console.log(res);
}
calculateTotalSupply();
