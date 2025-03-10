import { Client } from 'pg';
import * as fs from 'fs';

enum ColIndex {
    RawBFR,
    RawEsBFR,
    BLPRewardAsEsBfr,
    UnclaimedVester1,
    UnclaimedVester2,
    Staking,
    Camelot,
}

// Define PostgreSQL error interface
interface PostgresError {
    code?: string;
    message: string;
}

const BATCH_SIZE = 1000; // Process 100 records at a time
const destinationConnectionString = "postgresql://postgres:BtJrnYycTfSeVacrYJtEdQtlZRDhOlVi@shuttle.proxy.rlwy.net:26437/railway"

// PostgreSQL connection configuration
const client = new Client({
    connectionString: destinationConnectionString,
});

async function verifyConnection() {
    let retries = 3;
    while (retries > 0) {
        try {
            await client.connect();
            // Test the connection
            await client.query('SELECT 1');
            console.log('Successfully connected to the database');
            return true;
        } catch (error) {
            const pgError = error as PostgresError;
            console.error('Connection attempt failed:', pgError.message);
            retries--;
            if (retries > 0) {
                console.log(`Retrying connection... ${retries} attempts remaining`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            }
        }
    }
    throw new Error('Failed to connect to the database after multiple attempts');
}

async function dropTable() {
    const dropTableQuery = `
        DROP TABLE IF EXISTS holdings;
        
    `;
    
    await client.query(dropTableQuery);
}
async function createTable() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS holdings (
            address TEXT PRIMARY KEY,
            raw_bfr NUMERIC(78,0),
            raw_esbfr NUMERIC(78,0),
            fsblp NUMERIC(78,0),
            vestor1 NUMERIC(78,0),
            vestor2 NUMERIC(78,0),
            staking NUMERIC(78,0),
            is_eoa BOOLEAN,
            remarks TEXT
        );
    `;
    
    await client.query(createTableQuery);
}

type HoldingsData = {
    [address: string]: string[];
}

type ContractCheckData = {
    [batch: string]: {
        [address: string]: string;
    };
}

async function insertBatch(values: any[][], valueParams: string[], client: Client) {
    const insertQuery = `
        INSERT INTO holdings (
            address, raw_bfr, raw_esbfr, fsblp, 
            vestor1, vestor2, staking, is_eoa, remarks
        ) 
        VALUES ${valueParams.join(', ')};
    `;
    await client.query(insertQuery, values.flat());
}

async function loadData() {
    try {
        // Verify connection first
        await verifyConnection();
        await dropTable();
        await createTable();

        // Load data from files
        const data = JSON.parse(fs.readFileSync('./data.json', 'utf-8')) as HoldingsData;
        const batch = JSON.parse(fs.readFileSync('./contract_check_progress.json', 'utf-8')) as ContractCheckData;

        // Process contract check data
        const isContract: { [key: string]: boolean } = {};
        for (const b in batch) {
            for (const address in batch[b]) {
                isContract[address] = batch[b][address] === "contract";
            }
        }

        // Process in batches
        const entries = Object.entries(data);
        const totalRecords = entries.length;
        let processedRecords = 0;
        let values: any[][] = [];
        let valueParams: string[] = [];
        let paramCounter = 1;

        console.log(`Total records to process: ${totalRecords}`);

        for (const [address, vals] of entries) {
            values.push([
                address,
                vals[ColIndex.RawBFR] || '0',
                vals[ColIndex.RawEsBFR] || '0',
                vals[ColIndex.BLPRewardAsEsBfr] || '0',
                vals[ColIndex.UnclaimedVester1] || '0',
                vals[ColIndex.UnclaimedVester2] || '0',
                vals[ColIndex.Staking] || '0',
                !isContract[address],
                ''
            ]);
            
            valueParams.push(`($${paramCounter}, $${paramCounter + 1}, $${paramCounter + 2}, $${paramCounter + 3}, $${paramCounter + 4}, $${paramCounter + 5}, $${paramCounter + 6}, $${paramCounter + 7}, $${paramCounter + 8})`);
            paramCounter += 9;
            processedRecords++;

            // Insert when batch size is reached or this is the last batch
            if (values.length === BATCH_SIZE || processedRecords === totalRecords) {
                console.log(`Inserting batch of ${values.length} records (${processedRecords}/${totalRecords})`);
                await insertBatch(values, valueParams, client);
                values = [];
                valueParams = [];
                paramCounter = 1;
            }
        }

        console.log('Data loaded successfully!');

    } catch (error) {
        const pgError = error as PostgresError;
        if (pgError.code === '23505') {
            console.error('Error: Duplicate address found! Some addresses already exist in the database.');
        } else if (pgError.code === '28P01') {
            console.error('Error: Authentication failed. Please check your database credentials.');
        } else if (pgError.code === '08001' || pgError.code === '08006') {
            console.error('Error: Could not connect to the database. Please check if the database is running and accessible.');
        } else {
            console.error('Error:', pgError.message);
            console.error('Error code:', pgError.code);
        }
        process.exit(1);
    } finally {
        try {
            await client.end();
            console.log('Database connection closed.');
        } catch (error) {
            const pgError = error as PostgresError;
            console.error('Error closing connection:', pgError.message);
        }
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Cleaning up...');
    try {
        await client.end();
        console.log('Database connection closed.');
    } catch (error) {
        const pgError = error as PostgresError;
        console.error('Error during cleanup:', pgError.message);
    }
    process.exit(0);
});

loadData();