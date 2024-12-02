type TransactionLog = {
    block_number: number;
    timestamp: string; // ISO 8601 timestamp format
    transaction_hash: string;
    transaction_position: number;
    log_index: number;
    address: `0x${string}`;
    topic_0: `0x${string}`;
    topic_1: `0x${string}`;
    topic_2: `0x${string}`;
    topic_3: `0x${string}` | null;
    data: `0x${string}`;
    __confirmed: boolean;
  };
  
  type ResponseSchema = {
    name: string;
    type: string;
  };
  
  export type ApiResponse = {
    status: "success" | "error";
    stats: {
      count: number;
      size: number;
      time: number;
      truncated: boolean;
    };
    results: TransactionLog[];
    response_schema: ResponseSchema[];
  };
  