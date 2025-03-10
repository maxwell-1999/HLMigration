import { Elysia } from 'elysia';
import { Pool } from 'pg';

// PostgreSQL connection configuration
const dbConfig = {
    connectionString: "postgresql://postgres:BtJrnYycTfSeVacrYJtEdQtlZRDhOlVi@shuttle.proxy.rlwy.net:26437/railway",
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection
};

// Create a connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
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
    is_eoa: boolean;
    remarks: string;
}

interface RequestBody {
    address: string;
}

// Create the server
const app = new Elysia()
    .get("/", () => "Holdings API Server")
    .post("/holdings", async ({ body }) => {
        const { address } = body as RequestBody;
        
        if (!address) {
            return {
                status: 400,
                body: {
                    error: "Address is required in request body"
                }
            };
        }

        let client;
        try {
            client = await pool.connect();
            
            const query = `
                SELECT * FROM holdings 
                WHERE address = $1
                LIMIT 1;
            `;
            
            const result = await client.query(query, [address]);
            console.log("result",address,result.rows.length);   
            if (result.rows.length === 0) {
                return {
                    status: 404,
                    body: {
                        error: "Address not found"
                    }
                };
            }

            const holding = result.rows[0] as HoldingData;
            
            return {
                status: 200,
                body: holding
            };

        } catch (error) {
            console.error('Database error:', error);
            return {
                status: 500,
                body: {
                    error: "Internal server error"
                }
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
