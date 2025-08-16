const fs = require('fs');
const axios = require('axios');

// Create data directory if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

async function fetchMarketData() {
  try {
    console.log('Fetching market data...');
    
    // Fetch crypto data
    const cryptoResponse = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 50,
        price_change_percentage: '24h'
      },
      timeout: 10000
    });

    const cryptoData = cryptoResponse.data.map(coin => ({
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      volume: coin.total_volume,
      lastUpdated: new Date().toISOString()
    }));

    // Save data
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoData
    }, null, 2));

    console.log('Successfully updated market data');
  } catch (error) {
    console.error('Error fetching data:', error.message);
    // Write empty file on error
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: [],
      error: error.message
    }));
  }
}

fetchMarketData();
