const fs = require('fs');
const axios = require('axios');

// Create data directory if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

async function fetchCryptoData() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 10,
        price_change_percentage: '24h'
      },
      timeout: 10000
    });

    const data = response.data.map(coin => ({
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      volume: coin.total_volume,
      lastUpdated: new Date().toISOString()
    }));

    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: data
    }));

    console.log('Successfully fetched crypto data');
  } catch (error) {
    console.error('Error fetching data:', error.message);
    // Write empty file on error
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: []
    }));
  }
}

fetchCryptoData();
