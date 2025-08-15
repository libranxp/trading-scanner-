const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');
const math = require('mathjs');

// 1. Configuration
const CONFIG = {
  CRYPTO: {
    minVolume: 10000000, // $10M
    rsiRange: [40, 70],
    emaPeriods: [5, 13, 50]
  },
  STOCKS: {
    minVolume: 500000, // shares
    rsiRange: [45, 75],
    emaPeriods: [9, 21, 50]
  }
};

// 2. Technical Analysis Engine
class Analyzer {
  static calculateEMA(prices, period) {
    return ti.ema({ values: prices, period }).pop();
  }

  static calculateVWAP(ticks) {
    const typicalPrices = ticks.map(t => (t.high + t.low + t.close) / 3);
    const volumes = ticks.map(t => t.volume);
    const cumulativePV = typicalPrices.map((p, i) => p * volumes[i]);
    const cumulativeVol = volumes.reduce((a, b) => a + b, 0);
    return math.sum(cumulativePV) / cumulativeVol;
  }

  static calculateRVOL(currentVol, avgVol) {
    return currentVol / avgVol;
  }
}

// 3. Data Fetchers
async function fetchCryptoData() {
  const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 100,
      sparkline: true,
      price_change_percentage: '1h,24h,7d'
    },
    timeout: 15000
  });
  return response.data;
}

async function fetchStockData(symbol) {
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    params: {
      interval: '5m',
      range: '5d'
    },
    timeout: 15000
  });
  return response.data.chart.result[0];
}

// 4. News Scraper
async function scrapeNews(symbol, isCrypto) {
  const url = isCrypto ? 
    `https://www.tradingview.com/symbols/${symbol}USD/news/` :
    `https://www.tradingview.com/symbols/${symbol}/news/`;
  
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    return $('.news-item').slice(0, 3).map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: $(el).attr('href'),
      time: $(el).find('.time').text().trim()
    })).get();
  } catch {
    return [];
  }
}

// 5. AI Validation Generator
function generateAIValidation(signal, history) {
  const reasons = [];
  
  // Price Momentum
  if (signal.change24h > 5) reasons.push(`Strong 24h gain (+${signal.change24h.toFixed(1)}%)`);
  else if (signal.change24h < -3) reasons.push(`Significant drop (${signal.change24h.toFixed(1)}%)`);

  // Volume Analysis
  if (signal.rvol > 2) reasons.push(`High relative volume (${signal.rvol.toFixed(1)}x avg)`);

  // Technical Patterns
  if (signal.emaAlignment) reasons.push(`Bullish EMA alignment (${signal.emaShort} > ${signal.emaLong})`);
  if (signal.rsi < 30) reasons.push(`Oversold (RSI ${signal.rsi.toFixed(1)})`);
  if (signal.rsi > 70) reasons.push(`Overbought (RSI ${signal.rsi.toFixed(1)})`);

  return reasons.length > 0 ? 
    reasons.join(' • ') : 
    'Normal market fluctuations';
}

// 6. Risk Calculator
function calculateRisk(signal) {
  const atrPercent = (signal.atr / signal.price) * 100;
  return {
    stopLoss: signal.price * (1 - (atrPercent * 1.5 / 100)),
    takeProfit: signal.price * (1 + (atrPercent * 3 / 100)),
    positionSize: math.min(0.1, (1 / atrPercent) * 100).toFixed(1) + '%'
  };
}

// 7. Main Scanner Function
async function scan() {
  try {
    console.log('🚀 Starting full market scan...');
    
    // A. Scan Cryptocurrencies
    const cryptos = await fetchCryptoData();
    const cryptoSignals = await processAssets(cryptos, true);
    
    // B. Scan Stocks (Top 50 by volume)
    const stockSymbols = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'SPY']; // Example - replace with actual scanner
    const stockSignals = await Promise.all(
      stockSymbols.map(s => fetchStockData(s).then(d => processStock(d, s)))
    );

    // C. Save Results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoSignals.filter(s => s !== null)
    }, null, 2));

    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockSignals.filter(s => s !== null)
    }, null, 2));

    console.log('✅ Scan completed successfully');
  } catch (error) {
    console.error('❌ Scan failed:', error);
  }
}

// Helper processing functions
async function processAssets(assets, isCrypto) {
  return Promise.all(assets.map(async asset => {
    try {
      const prices = asset.sparkline_in_7d.price.slice(-90);
      const emas = CONFIG[isCrypto ? 'CRYPTO' : 'STOCKS'].emaPeriods.map(p => 
        Analyzer.calculateEMA(prices, p)
      );
      
      const signal = {
        symbol: asset.symbol.toUpperCase(),
        name: asset.name,
        price: asset.current_price,
        change24h: asset.price_change_percentage_24h,
        volume: asset.total_volume,
        rsi: ti.rsi({ values: prices.slice(-24), period: 14 }).pop(),
        emaShort: emas[0],
        emaLong: emas[1],
        emaAlignment: emas[0] > emas[1] && emas[1] > emas[2],
        vwap: Analyzer.calculateVWAP(prices.map((p, i) => ({
          high: p * 1.01, low: p * 0.99, close: p, volume: asset.total_volume / 24
        }))),
        rvol: Analyzer.calculateRVOL(asset.total_volume, asset.total_volume / 2), // Simplified
        atr: ti.atr({
          high: prices.map(p => p * 1.01),
          low: prices.map(p => p * 0.99),
          close: prices,
          period: 14
        }).pop(),
        news: await scrapeNews(asset.symbol, true),
        type: 'crypto',
        tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${asset.symbol.toUpperCase()}USD`
      };

      return {
        ...signal,
        aiValidation: generateAIValidation(signal),
        risk: calculateRisk(signal)
      };
    } catch (error) {
      console.error(`Error processing ${asset.symbol}:`, error.message);
      return null;
    }
  }));
}

async function processStock(data, symbol) {
  // Similar processing for stocks
  // ... (implementation omitted for brevity)
}

// Run the scanner
scan();
