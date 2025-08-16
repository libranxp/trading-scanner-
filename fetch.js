const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');
const math = require('mathjs');

// Configuration
const CONFIG = {
  CRYPTO: {
    apiUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 250,
      sparkline: true,
      price_change_percentage: '1h,24h'
    },
    filters: {
      priceMin: 0.001,
      priceMax: 100,
      volumeMin: 10000000,
      marketCapMin: 10000000,
      marketCapMax: 5000000000,
      priceChangeMin: 2,
      priceChangeMax: 20,
      rsiMin: 50,
      rsiMax: 70,
      rvolMin: 2
    }
  },
  STOCKS: {
    apiUrl: 'https://financialmodelingprep.com/api/v3',
    apiKey: process.env.FMP_API_KEY || 'YOUR_API_KEY',
    filters: {
      priceMin: 0.04,
      volumeMin: 500000,
      priceChangeMin: 1,
      rvolMin: 1.2,
      rsiMin: 45,
      rsiMax: 75
    }
  }
};

// Create data directory if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

async function fetchWithRetry(url, params = {}, retries = 3) {
  try {
    const response = await axios.get(url, { params, timeout: 15000 });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, params, retries - 1);
    }
    throw error;
  }
}

function calculateIndicators(prices, volumes) {
  const closes = prices.slice(-100);
  const ema9 = ti.ema({ values: closes, period: 9 }).pop();
  const ema21 = ti.ema({ values: closes, period: 21 }).pop();
  
  // Calculate VWAP
  let vwap = 0;
  if (volumes && volumes.length === closes.length) {
    const typicalPrices = closes.map((close, i) => {
      const high = close * 1.01;
      const low = close * 0.99;
      return (high + low + close) / 3;
    });
    const pv = typicalPrices.map((p, i) => p * volumes[i]);
    vwap = math.sum(pv) / math.sum(volumes);
  }

  return {
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema9,
    ema21,
    vwap,
    atr: ti.atr({
      high: closes.map(p => p * 1.01),
      low: closes.map(p => p * 0.99),
      close: closes,
      period: 14
    }).pop(),
    currentPrice: closes[closes.length - 1]
  };
}

async function processCryptoData() {
  try {
    const data = await fetchWithRetry(CONFIG.CRYPTO.apiUrl, CONFIG.CRYPTO.params);
    const results = [];

    for (const coin of data) {
      try {
        if (coin.current_price < CONFIG.CRYPTO.filters.priceMin || 
            coin.current_price > CONFIG.CRYPTO.filters.priceMax) continue;
        if (coin.total_volume < CONFIG.CRYPTO.filters.volumeMin) continue;
        if (coin.market_cap < CONFIG.CRYPTO.filters.marketCapMin || 
            coin.market_cap > CONFIG.CRYPTO.filters.marketCapMax) continue;
        if (!coin.price_change_percentage_24h || 
            coin.price_change_percentage_24h < CONFIG.CRYPTO.filters.priceChangeMin ||
            coin.price_change_percentage_24h > CONFIG.CRYPTO.filters.priceChangeMax) continue;

        const indicators = calculateIndicators(
          coin.sparkline_in_7d.price,
          Array(coin.sparkline_in_7d.price.length).fill(coin.total_volume / 24)
        );

        if (indicators.rsi < CONFIG.CRYPTO.filters.rsiMin || 
            indicators.rsi > CONFIG.CRYPTO.filters.rsiMax) continue;

        const rvol = calculateRVol(coin.total_volume, coin.total_volume / 2);
        if (rvol < CONFIG.CRYPTO.filters.rvolMin) continue;

        const vwapDiff = Math.abs(indicators.currentPrice - indicators.vwap) / indicators.vwap * 100;
        if (vwapDiff > 2) continue;

        const atrPercent = (indicators.atr / indicators.currentPrice) * 100;
        const risk = {
          stopLoss: indicators.currentPrice * (1 - (atrPercent * 1.5 / 100)),
          takeProfit: indicators.currentPrice * (1 + (atrPercent * 3 / 100)),
          positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`
        };

        results.push({
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          volume: coin.total_volume,
          rsi: indicators.rsi,
          ema9: indicators.ema9,
          ema21: indicators.ema21,
          vwap: indicators.vwap,
          atr: indicators.atr,
          rvol,
          risk,
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${coin.symbol.toUpperCase()}USD`,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error processing ${coin.symbol}:`, error.message);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to process crypto data:', error);
    return [];
  }
}

async function runScan() {
  try {
    console.log('Starting market scan...');
    
    const cryptoData = await processCryptoData();
    
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoData
    }, null, 2));
    
    console.log(`Scan completed: ${cryptoData.length} cryptos found`);
  } catch (error) {
    console.error('Scan failed:', error);
    
    if (!fs.existsSync('data/crypto.json')) {
      fs.writeFileSync('data/crypto.json', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: []
      }));
    }
  }
}

runScan();
