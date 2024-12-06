import { sleep } from "bun";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import JSONBig from "json-bigint";
import type { AccountList } from ".";

const MAX_BATCH_SIZE = 500;
const client = createPublicClient({
  transport: http(
    "https://arb-mainnet.g.alchemy.com/v2/q8y6_aaOKZM4M30JUe0GYpWTVsOZ2au2"
  ),
  chain: arbitrum,
});
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
  console.log(
    `fetching ${calls.length} calls in chunk of size ${MAX_BATCH_SIZE}`
  );
  for await (const chunk of chunked) {
    try {
      const res = await client.multicall({ contracts: chunk });
      results = [
        ...results,
        ...res.map((r: any, i: any) => ({
          ...r,
          ...{ ...chunk[i], abi: null },
        })),
      ];
      console.log(
        `${callNumber++ * MAX_BATCH_SIZE}/${sz} done : ${results.length}`
      );
      await sleep(1000); // Pause for 1 second between calls
    } catch (e) {
      console.log(e);
    }
    // break;
  }
  return results;
};

export const convertMapToJson = (map: any) => {
  console.log("converting to obj");
  const mapObject = Object.fromEntries(map);
  const jsonB = JSONBig.stringify(mapObject);

  console.log("dumping to file");
  Bun.write("data.json", jsonB);
  console.log("dumped to file");
};
