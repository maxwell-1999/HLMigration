import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { Pool } from "pg";
import { getAddress } from "viem";

function createPool(name: string, connectionString: string | undefined) {
  if (!connectionString) {
    throw new Error(`${name} is required`);
  }

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on("error", (err) => {
    console.error(`Unexpected error on idle ${name} client`, err);
    process.exit(-1);
  });

  return pool;
}

const primaryPool = createPool("DATABASE_URL", process.env.DATABASE_URL);
const secondaryPool = process.env.DATABASE2_URL
  ? createPool("DATABASE2_URL", process.env.DATABASE2_URL)
  : undefined;

const holdingQuery = `
  SELECT
    address,
    raw_bfr::text,
    raw_esbfr::text,
    fsblp::text,
    vestor1::text,
    vestor2::text,
    staking::text,
    COALESCE(camelot, 0)::text AS camelot,
    COALESCE(otc, 0)::text AS otc_payment,
    COALESCE(total, 0)::text AS total_without_otc,
    is_eoa,
    remarks,
    source_file,
    snapshot_block
  FROM holdings
  WHERE lower(address) = lower($1)
  LIMIT 1;
`;

interface HoldingData {
  address: string;
  raw_bfr: string;
  raw_esbfr: string;
  fsblp: string;
  vestor1: string;
  vestor2: string;
  staking: string;
  camelot: string;
  otc: string;
  otc_payment: string;
  total: string;
  total_without_otc: string;
  is_eoa: boolean;
  remarks: string;
  source_file?: string;
  snapshot_block?: number;
}

interface RequestBody {
  address: string;
}

type HoldingRow = {
  address: string;
  raw_bfr: string | null;
  raw_esbfr: string | null;
  fsblp: string | null;
  vestor1: string | null;
  vestor2: string | null;
  staking: string | null;
  camelot: string | null;
  otc_payment: string | null;
  total_without_otc: string | null;
  is_eoa: boolean | null;
  remarks: string | null;
  source_file?: string | null;
  snapshot_block?: number | null;
};

const ZERO_WEI = "0";
const OTC_SPR_MULTIPLIER = 10n;
const PORT = Number(process.env.PORT ?? 3000);
const HOSTNAME = "0.0.0.0";
const LOG_REQUESTS = process.env.LOG_REQUESTS === "true";

function wei(value: string | null | undefined) {
  return value ?? ZERO_WEI;
}

function sumWei(values: string[]) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

async function findHolding(pool: Pool, address: string) {
  const result = await pool.query(holdingQuery, [address]);
  return (result.rows[0] as HoldingRow | undefined) ?? null;
}

function joinText(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).join("; ");
}

function mergeHoldings(primary: HoldingRow | null, secondary: HoldingRow | null) {
  const base = primary ?? secondary;
  if (!base) return null;

  const otcPayment = (
    BigInt(wei(primary?.otc_payment)) + BigInt(wei(secondary?.otc_payment))
  ).toString();

  return {
    ...base,
    otc_payment: otcPayment,
    remarks: joinText([primary?.remarks, secondary?.remarks]),
    source_file: joinText([primary?.source_file, secondary?.source_file]),
    snapshot_block: primary?.snapshot_block ?? secondary?.snapshot_block,
  } satisfies HoldingRow;
}

function mapHolding(row: HoldingRow): HoldingData {
  const raw_bfr = wei(row.raw_bfr);
  const raw_esbfr = wei(row.raw_esbfr);
  const fsblp = wei(row.fsblp);
  const vestor1 = wei(row.vestor1);
  const vestor2 = wei(row.vestor2);
  const staking = wei(row.staking);
  const camelot = wei(row.camelot);
  const otc_payment = wei(row.otc_payment);
  const otc = (BigInt(otc_payment) * OTC_SPR_MULTIPLIER).toString();
  const total_without_otc =
    row.total_without_otc ??
    sumWei([raw_bfr, raw_esbfr, fsblp, vestor1, vestor2, staking, camelot]);
  const total = sumWei([total_without_otc, otc]);

  return {
    address: row.address,
    raw_bfr,
    raw_esbfr,
    fsblp,
    vestor1,
    vestor2,
    staking,
    camelot,
    otc,
    otc_payment,
    total,
    total_without_otc,
    is_eoa: row.is_eoa ?? false,
    remarks: row.remarks ?? "",
    source_file: row.source_file ?? undefined,
    snapshot_block: row.snapshot_block ?? undefined,
  };
}

// Create the server
const app = new Elysia()
  .use(cors())
  .get("/", () => "Holdings API Server")
  .post("/holdings", async ({ body }) => {
    const { address: requestedAddress } = body as RequestBody;

    if (!requestedAddress) {
      return {
        status: 400,
        body: {
          error: "Address is required in request body",
        },
      };
    }

    let address: string;
    try {
      address = getAddress(requestedAddress);
    } catch {
      return {
        status: 400,
        body: {
          error: "Invalid address",
        },
      };
    }

    try {
      const [primaryHolding, secondaryHolding] = await Promise.all([
        findHolding(primaryPool, address),
        secondaryPool ? findHolding(secondaryPool, address) : Promise.resolve(null),
      ]);

      if (LOG_REQUESTS) {
        console.log("result", address, {
          primary: primaryHolding ? 1 : 0,
          secondary: secondaryHolding ? 1 : 0,
        });
      }
      const mergedHolding = mergeHoldings(primaryHolding, secondaryHolding);

      if (!mergedHolding) {
        return {
          status: 404,
          body: {
            error: "Address not found",
          },
        };
      }

      const holding = mapHolding(mergedHolding);

      return {
        status: 200,
        body: holding,
      };
    } catch (error) {
      console.error("Database error:", error);
      return {
        status: 500,
        body: {
          error: "Internal server error",
        },
      };
    }
  })
  .listen({
    port: PORT,
    hostname: HOSTNAME,
  });

console.log(
  `🦊 Holdings server is running at http://${app.server?.hostname}:${app.server?.port}`
);
