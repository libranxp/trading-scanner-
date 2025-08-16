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
      per_page: 10,
      sparkline: true,
      price_change_percentage: '24h'
    }
  },
  STOCKS: {
    apiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK-B', 'JPM', 'V'],
    params: {
      interval: '5m',
      range: '1d'
    }
  }
};

// Technical Analysis Engine
class Analyzer {
  static calculateIndicators(prices) {
    const closes = prices.slice(-100).filter(Boolean);
    if (closes.length < 14) return null;
    
    return {
      rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
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
}

// Data Processing Functions
async function fetchCryptoData() {
  try {
    const response = await axios.get(CONFIG.CRYPTO.apiUrl, {
      params: CONFIG.CRYPTO.params,
      timeout: 15000
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch crypto data:', error.message);
    return [];
  }
}

async function fetchStockData(symbol) {
  try {
    const response = await axios.get(`${CONFIG.STOCKS.apiUrl}/${symbol}`, {
      params: CONFIG.STOCKS.params,
      timeout: 15000
    });
    return {
      symbol,
      data: response.data.chart.result[0]
    };
  } catch (error) {
    console.error(`Failed to fetch ${symbol} data:`, error.message);
    return null;
  }
}

async function processAssets() {
  if (!fs.existsSync('data')) fs.mkdirSync('data');

  try {
    // Process Cryptocurrencies
    const cryptoAssets = await fetchCryptoData();
    const cryptoResults = await Promise.all(cryptoAssets.map(async asset => {
      const prices = asset.sparkline_in_7d.price;
      const indicators = Analyzer.calculateIndicators(prices);
      if (!indicators) return null;

      return {
        symbol: asset.symbol.toUpperCase(),
        name: asset.name,
        price: asset.current_price,
        change24h: asset.price_change_percentage_24h,
        volume: asset.total_volume,
        ...indicators,
        tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${asset.symbol.toUpperCase()}USD`,
        lastUpdated: new Date().toISOString()
      };
    }));

    // Process Stocks
    const stockResponses = await Promise.all(CONFIG.STOCKS.symbols.map(fetchStockData));
    const stockResults = stockResponses.filter(Boolean).map(response => {
      const closes = response.data.indicators.quote[0].close.filter(Boolean);
      const indicators = Analyzer.calculateIndicators(closes);
      if (!indicators) return null;

      return {
        symbol: response.symbol,
        name: response.data.meta.symbol,
        price: response.data.indicators.quote[0].close[closes.length - 1],
        change24h: ((response.data.indicators.quote[0].close[closes.length - 1] / 
                   response.data.indicators.quote[0].close[0] - 1) * 100,
        volume: response.data.indicators.quote[0].volume.reduce((a, b) => a + b, 0),
        ...indicators,
        tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${response.symbol}`,
        lastUpdated: new Date().toISOString()
      };
    }).filter(Boolean);

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoResults.filter(Boolean)
    }, null, 2));

    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockResults
    }, null, 2));

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Processing failed:', error);
  }
}

processAssets();
