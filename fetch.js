const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');

// Configuration
const CONFIG = {
  CRYPTO: {
    apiUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 20,
      sparkline: true,
      price_change_percentage: '1h,24h,7d'
    }
  },
  STOCKS: {
    apiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    params: {
      interval: '5m',
      range: '1d'
    }
  }
};

// Technical Analysis Engine
class Analyzer {
  static calculateIndicators(prices) {
    const closes = prices.slice(-100);
    return {
      rsi: this.calculateRSI(closes),
      ema9: ti.ema({ values: closes, period: 9 }).pop(),
      ema21: ti.ema({ values: closes, period: 21 }).pop(),
      atr: this.calculateATR(prices)
    };
  }

  static calculateRSI(closes) {
    return ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50;
  }

  static calculateATR(prices) {
    return ti.atr({
      high: prices.map(p => p * 1.01),
      low: prices.map(p => p * 0.99),
      close: prices,
      period: 14
    }).pop();
  }
}

// News Scraper
async function scrapeNews(symbol, isCrypto) {
  try {
    const url = isCrypto
      ? `https://www.tradingview.com/symbols/${symbol}USD/news/`
      : `https://www.tradingview.com/symbols/${symbol}/news/`;
    
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    return $('.news-item').slice(0, 3).map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: $(el).attr('href'),
      time: $(el).find('.time').text().trim()
    })).get();
  } catch (error) {
    console.error(`News scrape failed for ${symbol}:`, error.message);
    return [];
  }
}

// AI Signal Generator
function generateSignal(asset, indicators, isCrypto) {
  const score = Math.min(100, Math.max(0, 
    50 + (indicators.rsi - 50) * 0.5 + 
    (asset.price_change_24h || 0) * 2
  ));

  const reasons = [];
  if (indicators.rsi < 30) reasons.push('Oversold (RSI < 30)');
  if (indicators.rsi > 70) reasons.push('Overbought (RSI > 70)');
  if (indicators.ema9 > indicators.ema21) reasons.push('Bullish EMA Cross');

  return {
    score: Math.round(score),
    validation: reasons.length ? reasons.join(' • ') : 'Neutral market conditions',
    risk: this.calculateRisk(asset.current_price, indicators.atr)
  };
}

function calculateRisk(price, atr) {
  const atrPercent = (atr / price) * 100;
  return {
    stopLoss: price * (1 - (atrPercent * 1.5 / 100)),
    takeProfit: price * (1 + (atrPercent * 3 / 100)),
    positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`
  };
}

// Main Scanner
async function runScan() {
  try {
    if (!fs.existsSync('data')) fs.mkdirSync('data');

    // Fetch and process data
    const [cryptoData, stockData] = await Promise.all([
      fetchAssets('CRYPTO'),
      fetchAssets('STOCKS')
    ]);

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify(cryptoData, null, 2));
    fs.writeFileSync('data/stocks.json', JSON.stringify(stockData, null, 2));

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

runScan();

async function fetchAssets(type) {
  try {
    const { apiUrl, params } = CONFIG[type];
    const response = await axios.get(apiUrl, { params, timeout: 15000 });
    return Promise.all(response.data.map(async asset => {
      const prices = type === 'CRYPTO' 
        ? asset.sparkline_in_7d.price 
        : await getStockPrices(asset.symbol);
      
      const indicators = Analyzer.calculateIndicators(prices);
      const signal = generateSignal(asset, indicators, type === 'CRYPTO');

      return {
        symbol: asset.symbol.toUpperCase(),
        name: asset.name || asset.symbol,
        price: asset.current_price || prices[prices.length - 1],
        change24h: asset.price_change_percentage_24h || 0,
        volume: asset.total_volume || 0,
        ...indicators,
        ...signal,
        news: await scrapeNews(asset.symbol, type === 'CRYPTO'),
        tradingViewUrl: type === 'CRYPTO'
          ? `https://www.tradingview.com/chart/?symbol=${asset.symbol.toUpperCase()}USD`
          : `https://www.tradingview.com/chart/?symbol=${asset.symbol}`,
        lastUpdated: new Date().toISOString()
      };
    }));
  } catch (error) {
    console.error(`Error fetching ${type}:`, error);
    return [];
  }
}

async function getStockPrices(symbol) {
  const response = await axios.get(
    `${CONFIG.STOCKS.apiUrl}/${symbol}`,
    { params: CONFIG.STOCKS.params, timeout: 15000 }
  );
  return response.data.chart.result[0].indicators.quote[0].close.filter(Boolean);
}
