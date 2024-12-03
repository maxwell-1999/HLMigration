import { createPublicClient, encodeEventTopics, erc20Abi, getContract, http } from "viem";
import { vesterAbi } from "./ABI";
import { arbitrumClient } from ".";
import { arbitrum } from "viem/chains";
const client = createPublicClient({
    transport:http(),
    chain:arbitrum
})

// const address = "0x92f424a2A65efd48ea57b10D345f4B3f2460F8c8";

// // const vesterv1 = getContract({
// //     address,
// //     abi:vesterAbi,
// //     client:arbitrumClient
// // })
// const resp = await client.getContractEvents({
//     address:"0x1a5b0aaf478bf1fda7b934c76e7692d722982a6d",
//     abi:erc20Abi,
//     // eventName:'Withdraw',

// })
const deposittopic = encodeEventTopics({
    abi:vesterAbi,
    eventName:"Deposit"
})
const withdrawtopic = encodeEventTopics({
    abi:vesterAbi,
    eventName:"Withdraw"
})
const claimTopic = encodeEventTopics({
    abi:vesterAbi,
    eventName:"Claim"
})
console.log(deposittopic,withdrawtopic,claimTopic)