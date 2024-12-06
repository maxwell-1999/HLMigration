import type { Address } from "viem";
import type { ApiResponse } from "./types";
import axios from "axios";
import { transposeClient } from "./config";
import { blockLimit } from ".";

async function getTokenHolderList(token: Address) {
  const response: { data: ApiResponse } = await transposeClient.post(
    "https://api.transpose.io/sql",
    {
      sql: `SELECT Count(*) arbitrum.logs WHERE address = '${token}' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' ${blockLimit()} ;`,
      parameters: {},
      options: {},
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25",
      },
    }
  );
  const totalEnteries = response.data.results[0];
  console.log(totalEnteries);
  //   while (true) {
  //     const query = `SELECT data,topic_0,topic_1,topic_2 FROM arbitrum.logs WHERE address = '${token}' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' ${blockLimit()} offset {{offset}} limit {{limit}};`;
  //     const response: { data: ApiResponse } = await transposeClient.post(
  //       "https://api.transpose.io/sql",
  //       {
  //         sql: query,
  //         parameters: {
  //             offset:
  //         },
  //         options: {},
  //       },
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //           "X-API-KEY": "IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25",
  //         },
  //       }
  //     );
  //   }
}

// getTokenHolderList("0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d");
