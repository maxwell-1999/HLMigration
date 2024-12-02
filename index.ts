import { decodeEventLog, erc20Abi } from "viem";
import type { ApiResponse } from "./types";

const axios = require('axios');
function limit(){
    return "LIMIT 10";
}
const bfrResponse:{data:ApiResponse} = await axios.post(
    'https://api.transpose.io/sql',
    {
        'sql': `SELECT *   FROM arbitrum.logs WHERE address = \'0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d\' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' AND block_number <= 280607605    ${limit()};  `,
        'parameters': {},
        'options': {}
    },
    {
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': 'IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25'
        }
    }
);
const esBfrResponse:{data:ApiResponse} = await axios.post(
    'https://api.transpose.io/sql',
    {
        'sql': `SELECT *   FROM arbitrum.logs WHERE address = \'0x92914A456EbE5DB6A69905f029d6160CF51d3E6a\' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' AND block_number <= 280607605    ${limit()};  `,
        'parameters': {},
        'options': {}
    },
    {
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': 'IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25'
        }
    }
);

const BFRHolders = new Set();
const esBfrHolders = new Set();

bfrResponse.data.results.forEach(s=>{
    const decodedEvent = decodeEventLog({
        abi:erc20Abi,
        eventName:"Transfer",
        data:s.data,
        topics:[s.topic_0,s.topic_1,s.topic_2]
    })
    BFRHolders.add(decodedEvent.args.from)
    BFRHolders.add(decodedEvent.args.to)
    // console.log(decodedEvent)
})
esBfrResponse.data.results.forEach(s=>{
    const decodedEvent = decodeEventLog({
        abi:erc20Abi,
        eventName:"Transfer",
        data:s.data,
        topics:[s.topic_0,s.topic_1,s.topic_2]
    })
    esBfrHolders.add(decodedEvent.args.from)
    esBfrHolders.add(decodedEvent.args.to)
})
const holdersArr = [...BFRHolders];

