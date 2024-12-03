const axios = require('axios');

const response = await axios.post(
    'https://api.transpose.io/sql',
    {
        'sql': 'SELECT data FROM arbitrum.logs WHERE address = \'0x92914A456EbE5DB6A69905f029d6160CF51d3E6a\' AND topic_0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' AND block_number <= 280607605 LIMIT 10;',
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
