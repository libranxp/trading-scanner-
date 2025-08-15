const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Create data directory if missing
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// Robust API fetch with timeout
async function fetchData() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 50,
        sparkline: true,
        price_change_percentage: '24h'
      },
      timeout: 15000
    });
    return data.filter(coin => coin?.sparkline_in_7d?.price?.length > 20);
  } catch (error) {
    console.error('API Error:', error.message);
    return [];
  }
}

function calculateRSI(prices) {
  try {
    return ti.rsi({ values: prices.slice(-24), period: 14 }).pop() || 50;
  } catch {
    return 50;
  }
}

async function scan() {
  const coins = await fetchData();
  const signals = [];

  for (const coin of coins) {
    try {
      const rsi = calculateRSI(coin.sparkline_in_7d.price);
      
      if (coin.total_volume > 10000000 && rsi >= 40 && rsi <= 70) {
        signals.push({
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h || 0,
          volume: coin.total_volume,
          rsi: rsi,
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(`Error processing ${coin?.symbol}:`, err.message);
    }
  }

  // Write output
  fs.writeFileSync('data/crypto.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    data: signals
  }, null, 2));

  console.log(`Found ${signals.length} valid signals`);
}

scan().catch(console.error);
