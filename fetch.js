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
      price_change_percentage: '24h'
    }
  },
  STOCKS: {
    apiUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'WMT'],
    params: {
      interval: '5m',
      range: '1d'
    }
  }
};

// Create data directory if not exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

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
    return response.data.chart.result[0];
  } catch (error) {
    console.error(`Failed to fetch ${symbol} data:`, error.message);
    return null;
  }
}

function calculateIndicators(prices) {
  const closes = prices.slice(-100);
  return {
    price: closes[closes.length - 1],
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema9: ti.ema({ values: closes, period: 9 }).pop(),
    ema21: ti.ema({ values: closes, period: 21 }).pop(),
    atr: ti.atr({
      high: prices.map(p => p * 1.01),
      low: prices.map(p => p * 0.99),
      close: prices,
      period: 14
    }).pop()
  };
}

async function scrapeNews(symbol, isCrypto) {
  try {
    const url = isCrypto
      ? `https://www.tradingview.com/symbols/${symbol}USD/news/`
      : `https://www.tradingview.com/symbols/${symbol}/news/`;
    
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    return $('.news-item').slice(0, 3).map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: `https://www.tradingview.com${$(el).attr('href')}`,
      time: $(el).find('.time').text().trim()
    })).get();
  } catch (error) {
    console.error(`News scrape failed for ${symbol}:`, error.message);
    return [];
  }
}

function generateSignal(asset, indicators, isCrypto) {
  const score = Math.min(100, Math.max(0, 
    50 + (indicators.rsi - 50) * 0.5 + 
    (asset.price_change_percentage_24h || 0) * 2
  ));

  const reasons = [];
  if (indicators.rsi < 30) reasons.push('Oversold (RSI < 30)');
  if (indicators.rsi > 70) reasons.push('Overbought (RSI > 70)');
  if (indicators.ema9 > indicators.ema21) reasons.push('Bullish EMA Cross');

  const atrPercent = (indicators.atr / indicators.price) * 100;
  
  return {
    score: Math.round(score),
    validation: reasons.length ? reasons.join(' • ') : 'Neutral market conditions',
    risk: {
      stopLoss: indicators.price * (1 - (atrPercent * 1.5 / 100)),
      takeProfit: indicators.price * (1 + (atrPercent * 3 / 100)),
      positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`
    }
  };
}

async function runScan() {
  try {
    console.log('Starting market scan...');
    
    // Fetch crypto data
    const cryptos = await fetchCryptoData();
    const cryptoResults = await Promise.all(cryptos.map(async crypto => {
      const indicators = calculateIndicators(crypto.sparkline_in_7d.price);
      const signal = generateSignal(crypto, indicators, true);
      
      return {
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.current_price,
        change24h: crypto.price_change_percentage_24h,
        volume: crypto.total_volume,
        ...indicators,
        ...signal,
        news: await scrapeNews(crypto.symbol, true),
        tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${crypto.symbol.toUpperCase()}USD`,
        lastUpdated: new Date().toISOString()
      };
    }));

    // Fetch stock data
    const stockResults = await Promise.all(CONFIG.STOCKS.symbols.map(async symbol => {
      const stock = await fetchStockData(symbol);
      if (!stock) return null;
      
      const closes = stock.indicators.quote[0].close.filter(Boolean);
      if (closes.length < 14) return null;
      
      const indicators = calculateIndicators(closes);
      const signal = generateSignal({}, indicators, false);
      
      return {
        symbol: stock.meta.symbol,
        name: stock.meta.symbol,
        price: stock.meta.regularMarketPrice,
        change24h: ((stock.meta.regularMarketPrice / stock.meta.previousClose - 1) * 100),
        volume: stock.meta.regularMarketVolume,
        ...indicators,
        ...signal,
        news: await scrapeNews(symbol, false),
        tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${stock.meta.symbol}`,
        lastUpdated: new Date().toISOString()
      };
    }));

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoResults
    }, null, 2));

    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockResults.filter(Boolean)
    }, null, 2));

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

runScan();
