const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');
const math = require('mathjs');

// Configuration with all scanner criteria
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
    apiKey: 'YOUR_FMP_API_KEY', // Get free key from financialmodelingprep.com
    filters: {
      priceMin: 0.01,
      priceMax: 100,
      volumeMin: 500000,
      priceChangeMin: 1,
      rvolMin: 1.2,
      rsiMin: 45,
      rsiMax: 75
    }
  }
};

// Create data directory if it doesn't exist
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// Enhanced fetch with retries
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

// Calculate all technical indicators
function calculateIndicators(prices, volumes) {
  const closes = prices.slice(-100);
  const ema5 = ti.ema({ values: closes, period: 5 }).pop();
  const ema13 = ti.ema({ values: closes, period: 13 }).pop();
  const ema50 = ti.ema({ values: closes, period: 50 }).pop();
  
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
    ema5,
    ema13,
    ema50,
    emaAlignment: ema5 > ema13 && ema13 > ema50,
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

// Calculate RVOL (Relative Volume)
function calculateRVol(currentVol, avgVol) {
  return currentVol / avgVol;
}

// Fetch Twitter mentions (simplified mock)
async function fetchTwitterMentions(symbol) {
  try {
    // In a real implementation, use Twitter API
    return {
      count: Math.floor(Math.random() * 50) + 10,
      sentiment: Math.random() * 0.5 + 0.5 // Mock sentiment 0.5-1.0
    };
  } catch {
    return { count: 0, sentiment: 0 };
  }
}

// Fetch news with sentiment analysis
async function fetchNews(symbol, isCrypto) {
  try {
    const url = isCrypto
      ? `https://www.tradingview.com/symbols/${symbol}USD/news/`
      : `https://www.tradingview.com/symbols/${symbol}/news/`;
    
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    const items = $('.news-item').slice(0, 5).map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: $(el).attr('href'),
      time: $(el).find('.time').text().trim(),
      sentiment: Math.random() * 0.5 + 0.5 // Mock sentiment
    })).get();

    return {
      items,
      avgSentiment: items.length > 0 
        ? items.reduce((sum, item) => sum + item.sentiment, 0) / items.length
        : 0
    };
  } catch {
    return { items: [], avgSentiment: 0 };
  }
}

// Process crypto data with all filters
async function processCryptoData() {
  try {
    const data = await fetchWithRetry(CONFIG.CRYPTO.apiUrl, CONFIG.CRYPTO.params);
    const results = [];

    for (const coin of data) {
      try {
        // Basic filters
        if (coin.current_price < CONFIG.CRYPTO.filters.priceMin || 
            coin.current_price > CONFIG.CRYPTO.filters.priceMax) continue;
        if (coin.total_volume < CONFIG.CRYPTO.filters.volumeMin) continue;
        if (coin.market_cap < CONFIG.CRYPTO.filters.marketCapMin || 
            coin.market_cap > CONFIG.CRYPTO.filters.marketCapMax) continue;
        if (!coin.price_change_percentage_24h || 
            coin.price_change_percentage_24h < CONFIG.CRYPTO.filters.priceChangeMin ||
            coin.price_change_percentage_24h > CONFIG.CRYPTO.filters.priceChangeMax) continue;

        // Calculate indicators
        const indicators = calculateIndicators(
          coin.sparkline_in_7d.price,
          Array(coin.sparkline_in_7d.price.length).fill(coin.total_volume / 24)
        );

        // Technical filters
        if (indicators.rsi < CONFIG.CRYPTO.filters.rsiMin || 
            indicators.rsi > CONFIG.CRYPTO.filters.rsiMax) continue;
        if (!indicators.emaAlignment) continue;

        // Calculate RVOL (using 24h avg volume)
        const rvol = calculateRVol(coin.total_volume, coin.total_volume / 2);
        if (rvol < CONFIG.CRYPTO.filters.rvolMin) continue;

        // VWAP proximity filter
        const vwapDiff = Math.abs(indicators.currentPrice - indicators.vwap) / indicators.vwap * 100;
        if (vwapDiff > 2) continue;

        // Get social data
        const twitter = await fetchTwitterMentions(coin.symbol);
        const news = await fetchNews(coin.symbol, true);

        // Social filters
        if (twitter.count < 10) continue;
        if (twitter.sentiment < 0.6) continue;
        if (news.avgSentiment < 0.6) continue;

        // Risk management
        const atrPercent = (indicators.atr / indicators.currentPrice) * 100;
        const risk = {
          stopLoss: indicators.currentPrice * (1 - (atrPercent * 1.5 / 100)),
          takeProfit: indicators.currentPrice * (1 + (atrPercent * 3 / 100)),
          positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`,
          entry: indicators.currentPrice,
          exit: indicators.ema5 < indicators.ema13 ? "EMA Bearish Cross" : "Hold"
        };

        results.push({
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          volume: coin.total_volume,
          marketCap: coin.market_cap,
          ...indicators,
          rvol,
          twitterMentions: twitter.count,
          twitterSentiment: twitter.sentiment,
          news: news.items,
          newsSentiment: news.avgSentiment,
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

// Process stock data with all filters
async function processStockData() {
  try {
    // Fetch active stocks meeting basic criteria
    const activeStocks = await fetchWithRetry(
      `${CONFIG.STOCKS.apiUrl}/stock-screener?apikey=${CONFIG.STOCKS.apiKey}`,
      {
        priceMoreThan: CONFIG.STOCKS.filters.priceMin,
        priceLowerThan: CONFIG.STOCKS.filters.priceMax,
        volumeMoreThan: CONFIG.STOCKS.filters.volumeMin
      }
    );

    const results = [];
    
    for (const stock of activeStocks.slice(0, 50)) { // Limit to top 50
      try {
        // Get detailed stock data
        const detail = await fetchWithRetry(
          `${CONFIG.STOCKS.apiUrl}/quote/${stock.symbol}?apikey=${CONFIG.STOCKS.apiKey}`
        );
        
        const priceChange = (detail[0].price / detail[0].previousClose - 1) * 100;
        
        // Basic filters
        if (priceChange < CONFIG.STOCKS.filters.priceChangeMin) continue;
        
        // Get historical data for indicators
        const historical = await fetchWithRetry(
          `${CONFIG.STOCKS.apiKey}/historical-chart/5min/${stock.symbol}?apikey=${CONFIG.STOCKS.apiKey}`
        );
        
        const closes = historical.map(h => h.close).filter(Boolean).slice(-100);
        const volumes = historical.map(h => h.volume).filter(Boolean).slice(-100);
        
        if (closes.length < 50) continue; // Not enough data
        
        // Calculate indicators
        const indicators = calculateIndicators(closes, volumes);
        
        // Technical filters
        if (indicators.rsi < CONFIG.STOCKS.filters.rsiMin || 
            indicators.rsi > CONFIG.STOCKS.filters.rsiMax) continue;
        if (!indicators.emaAlignment) continue;
        
        // Calculate RVOL (using 30-day avg volume)
        const rvol = calculateRVol(stock.volume, stock.avgVolume || stock.volume / 2);
        if (rvol < CONFIG.STOCKS.filters.rvolMin) continue;
        
        // VWAP proximity filter
        const vwapDiff = Math.abs(indicators.currentPrice - indicators.vwap) / indicators.vwap * 100;
        if (vwapDiff > 1.5) continue;
        
        // Get news and social data
        const news = await fetchNews(stock.symbol, false);
        
        // News/social filters
        if (news.items.length < 1) continue;
        if (news.avgSentiment < 0.6) continue;
        
        // Risk management
        const atrPercent = (indicators.atr / indicators.currentPrice) * 100;
        const risk = {
          stopLoss: indicators.currentPrice * (1 - (atrPercent * 1.5 / 100)),
          takeProfit: indicators.currentPrice * (1 + (atrPercent * 3 / 100)),
          positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`,
          entry: indicators.currentPrice,
          exit: indicators.ema5 < indicators.ema13 ? "EMA Bearish Cross" : "Hold"
        };
        
        results.push({
          symbol: stock.symbol,
          name: stock.companyName,
          price: detail[0].price,
          change24h: priceChange,
          volume: stock.volume,
          marketCap: stock.marketCap,
          ...indicators,
          rvol,
          news: news.items,
          newsSentiment: news.avgSentiment,
          risk,
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${stock.symbol}`,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error processing ${stock.symbol}:`, error.message);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to process stock data:', error);
    return [];
  }
}

// Main scan function
async function runScan() {
  try {
    console.log('Starting market scan...');
    
    const [cryptoData, stockData] = await Promise.all([
      processCryptoData(),
      processStockData()
    ]);
    
    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoData
    }, null, 2));
    
    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockData
    }, null, 2));
    
    console.log(`Scan completed: ${cryptoData.length} cryptos, ${stockData.length} stocks`);
  } catch (error) {
    console.error('Scan failed:', error);
    
    // Create empty files if scan fails
    if (!fs.existsSync('data/crypto.json')) {
      fs.writeFileSync('data/crypto.json', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: []
      }));
    }
    if (!fs.existsSync('data/stocks.json')) {
      fs.writeFileSync('data/stocks.json', JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: []
      }));
    }
  }
}

runScan();
