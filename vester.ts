import { encodeEventTopics, type Address } from "viem";
import { vesterAbi } from "./ABI";
import type { ApiResponse } from "./types";
import { blockNumber } from ".";
import { sleep } from "bun";
import axios from "axios";
import { transposeClient } from "./config";
export const indexToEvent = {
  0: "Deposit",
  1: "Withdraw",
  2: "Claim",
} as const;
export async function getUserWiseVestingEvents(vesterAddress: Address) {
  const response = await Promise.all(
    [
      encodeEventTopics({
        abi: vesterAbi,
        eventName: "Deposit",
      }),
      encodeEventTopics({
        abi: vesterAbi,
        eventName: "Withdraw",
      }),
      encodeEventTopics({
        abi: vesterAbi,
        eventName: "Claim",
      }),
    ].map(async (topic) => {
      //   sleep(2000);
      const response: { data: ApiResponse } = await transposeClient({
        method: "POST",
        data: {
          sql: `Select data, topic_0, topic_1, topic_2 FROM arbitrum.logs WHERE address = '${vesterAddress}' AND topic_0 = '${topic}' and block_number <= ${blockNumber}`,
          parameters: {},
          options: {},
        },
      });
      return response;
    })
  );
  return response;
  //   console.log(response);
}
