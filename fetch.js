const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const math = require('mathjs');

// Ensure data directory exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// Configuration
const CONFIG = {
  CRYPTO: {
    apiUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 100,
      sparkline: true,
      price_change_percentage: '24h'
    }
  }
};

async function fetchData() {
  try {
    const response = await axios.get(CONFIG.CRYPTO.apiUrl, {
      params: CONFIG.CRYPTO.params,
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch data:', error.message);
    throw error;
  }
}

function calculateIndicators(prices) {
  const closes = prices.slice(-100);
  return {
    rsi: ti.rsi({ values: closes, period: 14 }).pop(),
    ema9: ti.ema({ values: closes, period: 9 }).pop(),
    ema21: ti.ema({ values: closes, period: 21 }).pop(),
    atr: ti.atr({
      high: closes.map(p => p * 1.01),
      low: closes.map(p => p * 0.99),
      close: closes,
      period: 14
    }).pop()
  };
}

async function runScan() {
  try {
    const coins = await fetchData();
    const results = coins.map(coin => {
      const indicators = calculateIndicators(coin.sparkline_in_7d.price);
      return {
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        volume: coin.total_volume,
        ...indicators,
        lastUpdated: new Date().toISOString()
      };
    });

    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: results
    }, null, 2));

    console.log(`Scan completed with ${results.length} coins`);
  } catch (error) {
    console.error('Scan failed:', error);
    process.exit(1);
  }
}

runScan();
