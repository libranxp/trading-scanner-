const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Create data directory if needed
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
    : `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

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
      : {
          close: data.chart.result[0].indicators.quote[0].close.filter(Boolean)
        };
  } catch (error) {
    console.error(`Failed to fetch ${symbol}:`, error.message);
    return null;
  }
}

async function analyzeAsset(symbol, type) {
  const ohlc = await getOHLC(symbol, type === 'crypto');
  if (!ohlc) return null;

  const closes = ohlc.close.slice(-100);
  if (closes.length < 14) return null;

  return {
    symbol,
    price: closes[closes.length - 1],
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema9: ti.ema({ values: closes, period: 9 }).pop(),
    ema21: ti.ema({ values: closes, period: 21 }).pop(),
    lastUpdated: new Date().toISOString()
  };
}

async function runScan() {
  try {
    console.log('Starting market scan...');
    
    const [cryptoResults, stockResults] = await Promise.all([
      Promise.all(ASSETS.crypto.map(s => analyzeAsset(s, 'crypto'))),
      Promise.all(ASSETS.stocks.map(s => analyzeAsset(s, 'stocks')))
    ]);

    const validCrypto = cryptoResults.filter(Boolean);
    const validStocks = stockResults.filter(Boolean);

    if (validCrypto.length > 0) {
      fs.writeFileSync('data/crypto.json', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: validCrypto
      }, null, 2));
      console.log(`Saved ${validCrypto.length} crypto assets`);
    }

    if (validStocks.length > 0) {
      fs.writeFileSync('data/stocks.json', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: validStocks
      }, null, 2));
      console.log(`Saved ${validStocks.length} stocks`);
    }

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

runScan();
