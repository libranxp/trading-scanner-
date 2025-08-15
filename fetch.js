const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Create data directory if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const ASSETS = {
  crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],
  stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']
};

async function getOHLC(symbol, isCrypto) {
  const url = isCrypto
    ? `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/ohlc?vs_currency=usd&days=1`
    : `https://query1.finance.yahoo.com/v7/finance/chart/${symbol}?range=1d&interval=5m`;

  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    return isCrypto
      ? data.map(d => ({ 
          time: d[0]/1000, 
          open: d[1], 
          high: d[2], 
          low: d[3], 
          close: d[4] 
        }))
      : data.chart.result[0].indicators.quote[0];
  } catch (error) {
    console.error(`Failed to fetch ${symbol}:`, error.message);
    return null;
  }
}

async function analyzeAsset(symbol, type) {
  const ohlc = await getOHLC(symbol, type === 'crypto');
  if (!ohlc) return null;

  const closes = ohlc.close.filter(Boolean).slice(-100);
  if (closes.length < 14) return null;

  return {
    symbol,
    price: closes[closes.length - 1],
    rsi: ti.rsi({ values: closes, period: 14 }).pop() || 50,
    ema9: ti.ema({ values: closes, period: 9 }).pop() || closes[closes.length - 1],
    ema21: ti.ema({ values: closes, period: 21 }).pop() || closes[closes.length - 1],
    lastUpdated: new Date().toISOString()
  };
}

async function runScan() {
  try {
    const results = { crypto: [], stocks: [] };

    // Process crypto assets
    results.crypto = (await Promise.all(
      ASSETS.crypto.map(symbol => analyzeAsset(symbol, 'crypto'))
    )).filter(Boolean);

    // Process stocks
    results.stocks = (await Promise.all(
      ASSETS.stocks.map(symbol => analyzeAsset(symbol, 'stocks'))
    )).filter(Boolean);

    // Save results
    if (results.crypto.length > 0) {
      fs.writeFileSync(
        'data/crypto.json',
        JSON.stringify({
          lastUpdated: new Date().toISOString(),
          data: results.crypto
        }, null, 2)
      );
    }

    if (results.stocks.length > 0) {
      fs.writeFileSync(
        'data/stocks.json',
        JSON.stringify({
          lastUpdated: new Date().toISOString(),
          data: results.stocks
        }, null, 2)
      );
    }

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

runScan();
