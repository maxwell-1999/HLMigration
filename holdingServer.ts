import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors';
import { Pool } from "pg";
import { getAddress } from "viem";

// PostgreSQL connection configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
};

// Create a connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

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

function wei(value: string | null | undefined) {
  return value ?? ZERO_WEI;
}

function sumWei(values: string[]) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
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

    let client;
    try {
      client = await pool.connect();

      const query = `
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

      const result = await client.query(query, [address]);
      console.log("result", address, result.rows.length);
      if (result.rows.length === 0) {
        return {
          status: 404,
          body: {
            error: "Address not found",
          },
        };
      }

      const holding = mapHolding(result.rows[0] as HoldingRow);

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
    } finally {
      if (client) {
        client.release();
      }
    }
  })
  .listen(3000);

console.log(
  `🦊 Holdings server is running at http://${app.server?.hostname}:${app.server?.port}`
);
