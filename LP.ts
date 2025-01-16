import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getContract,
  type Address,
} from "viem";
import { PMAbi, PMMAbi, PoolAbi } from "./ABI";
import { alchemyClient, dumpToJSON } from "./utils";
import { addresses } from ".";
const POSITION_MANAGER_ADDRESS = addresses.bfrwethNFTPosManager;
export async function fillLPs2() {
  // const logs = await alchemyClient.getLogs({
  //   address: "0xB529f885260321729D9fF1C69804c5Bf9B3a95A5",
  // });
  // console.log(logs);
  // const events = await alchemyClient.getContractEvents({
  //   address: "0xB529f885260321729D9fF1C69804c5Bf9B3a95A5",
  //   abi: PoolAbi,
  //   fromBlock: 28182727n,
  //   eventName: "Mint",
  // });
  const events = await alchemyClient.readContract({
    address: "0xB529f885260321729D9fF1C69804c5Bf9B3a95A5",
    abi: erc20Abi,
    functionName: "balanceOf",
    args: ["0xC36442b4a4522E871399CD717aBDD847Ab11FE88"],
    // eventName: "Swap",
  });
  dumpToJSON(events, "dump");
  console.log("events", events);
  //   console.log("events", events);
}
export async function fillLPs() {
  async function getLPPositions(ownerAddress: Address) {
    // Step 1: Query the number of NFTs owned by the wallet
    // await alchemyClient.getContractEvents({
    //   address:POSITION_MANAGER_ADDRESS,
    //   abi:PMMAbi
    //   eventName:"Collect",
    // })
    const balance = await alchemyClient.readContract({
      abi: PMMAbi,
      functionName: "balanceOf",
      address: POSITION_MANAGER_ADDRESS,
      args: [ownerAddress],
    });

    console.log(`LP NFTs owned by ${ownerAddress}: ${balance}`);

    // Step 2: Iterate over each NFT to get token IDs and positions
    const positions: any[] = [];
    for (let i: bigint = 0n; i < balance; i++) {
      //fetch tokenId
      const tokenId = await alchemyClient.readContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: PMAbi,
        functionName: "tokenOfOwnerByIndex",
        args: [ownerAddress, i],
      });
      console.log("tokenId", tokenId);

      //   // Fetch position details for the token ID

      const posDetail = await alchemyClient.readContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: PMAbi,
        functionName: "positions",
        args: [tokenId],
      });
      console.log("posDetail", posDetail);

      //   // Structure the position details
      //   positions.push({
      //     tokenId: tokenId.toString(),
      //     token0: positionDetails.token0,
      //     token1: positionDetails.token1,
      //     fee: positionDetails.fee,
      //     tickLower: positionDetails.tickLower,
      //     tickUpper: positionDetails.tickUpper,
      //     liquidity: positionDetails.liquidity.toString(),
      //     tokensOwed0: positionDetails.tokensOwed0.toString(),
      //     tokensOwed1: positionDetails.tokensOwed1.toString(),
      //   });
      // }
    }
    return positions;
  }
  const res = await getLPPositions(
    "0x71e7d05be74ff748c45402c06a941c822d756dc5"
  );
}
