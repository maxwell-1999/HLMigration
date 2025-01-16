import { addresses } from "..";
import { GammaAbi } from "../ABI";
import { alchemyClient } from "../utils";

export async function fillGama() {
  const logs = await alchemyClient.getContractEvents({
    abi: GammaAbi,
    eventName: "Deposit",
    address: addresses.bfrWethGamma,
    fromBlock: 62815169n,
  });
  console.log("logs", logs);
}
