import { sleep } from "bun";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { blockNumber, type AccountList } from ".";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const MAX_BATCH_SIZE = 500;
export const alchemyClient = createPublicClient({
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
  // Sequentially execute multicalls using for await...of
  // console.log(
  //   `fetching ${calls.length} calls in chunk of size ${MAX_BATCH_SIZE}`
  // );
  for await (const [index, chunk] of chunked.entries()) {
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
      console.log(`multicall chunk ${index + 1}/${chunked.length}`);
      await sleep(1000); // Pause for 1 second between calls
    } catch (e) {
      console.error(`multicall chunk ${index + 1}/${chunked.length} failed`);
      throw e;
    }
    // break;
  }
  return results;
};
export function dumpToJSON(mapObject: any, fileName: string) {
  const jsonB = JSON.stringify(mapObject);
  Bun.write(`${fileName}.json`, jsonB);
  console.log("dumped to file");
}
export const convertMapToJson = (map: any, fileName: string = "data") => {
  const valuesum = Object.fromEntries(map);
  dumpToJSON(valuesum, fileName);
};
export const calculateSum = (map: any, fileName: string = "data") => {
  let total = 0n;
  [...map.keys()].forEach((ad) => {
    total += map.get(ad).reduce((prev, curr) => prev + curr, 0n);
  });
  dumpToJSON(Object.fromEntries(map), fileName);
};
// for (let acc in AccountList) {
//   const tota = AccountList.get(acc as Address)!.reduce((prev, curr) => {
//     return relu(prev) + relu(curr);
//   }, 0n);
//   total += tota;
// }

export function relu(ip: number | bigint | string | null | undefined) {
  if (ip == null) return 0n;

  let value: bigint;
  if (typeof ip == "number") {
    value = BigInt(ip);
  } else {
    value = BigInt(ip);
  }

  return value < 0n ? 0n : value;
}

export function bigintToFloat(bigintValue: bigint, decimals = 18) {
  const scaleBigInt = 10n ** BigInt(decimals);

  // Perform division to get the scaled value as a BigInt
  const integerPart = bigintValue / scaleBigInt;

  // Compute the fractional part as a float
  const fractionalPart =
    Number(bigintValue % scaleBigInt) / Number(scaleBigInt);

  // Combine integer and fractional parts
  return Number(integerPart) + fractionalPart;
}
