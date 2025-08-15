const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');
const math = require('mathjs');

// Configuration
const CONFIG = {
  CRYPTO: {
    symbols: ['BTC', 'ETH', 'SOL', 'XRP', 'ADA'],
    minVolume: 10000000 // $10M
  },
  STOCKS: {
    symbols: ['AAPL', 'TSLA', 'NVDA', 'AMD', 'SPY'],
    minVolume: 500000 // shares
  }
};

class Analyzer {
  static calculateRSI(prices) {
    return ti.rsi({ values: prices, period: 14 }).pop();
  }

  static calculateEMA(prices, period) {
    return ti.ema({ values: prices, period }).pop();
  }
}

async function fetchCryptoData(symbol) {
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/ohlc?vs_currency=usd&days=1`);
  return data.map(d => ({
    time: d[0]/1000,
    open: d[1],
    high: d[2],
    low: d[3],
    close: d[4]
  }));
}

async function processAsset(symbol, type) {
  try {
    const data = type === 'crypto' 
      ? await fetchCryptoData(symbol)
      : await fetchStockData(symbol);

    const prices = data.map(d => d.close);
    const signal = {
      symbol,
      price: prices[prices.length-1],
      rsi: Analyzer.calculateRSI(prices.slice(-24)),
      ema9: Analyzer.calculateEMA(prices, 9),
      ema21: Analyzer.calculateEMA(prices, 21),
      lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync(`data/${type}.json`, JSON.stringify({
      lastUpdated: signal.lastUpdated,
      data: [signal]
    }, null, 2));

  } catch (error) {
    console.error(`Error processing ${symbol}:`, error.message);
  }
}

// Main execution
(async () => {
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  
  await Promise.all([
    ...CONFIG.CRYPTO.symbols.map(s => processAsset(s, 'crypto')),
    ...CONFIG.STOCKS.symbols.map(s => processAsset(s, 'stocks'))
  ]);
})();
