const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Ensure data directory exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const ASSETS = {
  crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],
  stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']
};

async function fetchOHLC(symbol, isCrypto) {
  const url = isCrypto
    ? `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/ohlc?vs_currency=usd&days=1`
    : `https://query1.finance.yahoo.com/v7/finance/chart/${symbol}?range=1d&interval=5m`;

  const { data } = await axios.get(url);
  return isCrypto
    ? data.map(d => ({ time: d[0]/1000, open: d[1], high: d[2], low: d[3], close: d[4] }))
    : data.chart.result[0].indicators.quote[0];
}

async function processAsset(symbol, type) {
  try {
    const ohlc = await fetchOHLC(symbol, type === 'crypto');
    const closes = ohlc.close.filter(Boolean).slice(-100);
    
    if (closes.length < 14) return null; // Not enough data

    return {
      symbol,
      price: closes[closes.length - 1],
      rsi: ti.rsi({ values: closes, period: 14 }).pop(),
      ema9: ti.ema({ values: closes, period: 9 }).pop(),
      ema21: ti.ema({ values: closes, period: 21 }).pop(),
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error.message);
    return null;
  }
}

async function main() {
  const results = { crypto: [], stocks: [] };

  for (const type of ['crypto', 'stocks']) {
    results[type] = (await Promise.all(
      ASSETS[type].map(symbol => processAsset(symbol, type))
    )).filter(Boolean);

    fs.writeFileSync(
      `data/${type}.json`,
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: results[type]
      }, null, 2)
    );
  }
}

main().catch(console.error);
