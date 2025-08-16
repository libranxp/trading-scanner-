const fs = require('fs');
const axios = require('axios');

const DATA_DIR = 'public/data';
const CRYPTO_FILE = `${DATA_DIR}/crypto.json`;

async function fetchMarketData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        price_change_percentage: '1h,24h,7d',
        sparkline: true
      },
      timeout: 15000
    });

    const data = response.data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      volume: coin.total_volume,
      marketCap: coin.market_cap,
      sparkline: coin.sparkline_in_7d.price,
      lastUpdated: new Date().toISOString()
    }));

    fs.writeFileSync(CRYPTO_FILE, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: data
    }, null, 2));

    console.log('Successfully updated market data');
  } catch (error) {
    console.error('Error fetching data:', error.message);
    fs.writeFileSync(CRYPTO_FILE, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: [],
      error: error.message
    }));
  }
}

fetchMarketData();
