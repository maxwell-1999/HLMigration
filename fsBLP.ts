import { Client } from "pg";
import { fsBLPAbi } from "./ABI";
import { chunkedMulticall } from "./utils";
import { AccountList, addresses, ColIndex, defaultValue } from ".";

export async function fillfsBLP() {
  console.log("fillFSBLP");
  const destinationConnectionString =
    "postgresql://postgres:nwIqNaNUCZeBdUTGzIMSMNaHkZcOthcm@junction.proxy.rlwy.net:46679/railway";
  // CSV File and Schema
  const destinationClient = new Client({
    connectionString: destinationConnectionString,
  });
  await destinationClient.connect();
  const res = await destinationClient.query("SELECT * FROM account");
  const resp = await chunkedMulticall(
    res.rows.map((r) => {
      return {
        address: addresses.fsBLP,
        abi: fsBLPAbi,
        functionName: "claimable",
        args: [r.address],
      } as const;
    })
  );
  resp.map((s) => {
    let resp = AccountList.get(s.args[0]) || [...defaultValue];
    resp[ColIndex.BLPRewardAsEsBfr] = s.result;
    AccountList.set(s.args[0], [...resp]);
  });
}
