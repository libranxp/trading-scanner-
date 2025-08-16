const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Create data directory if it doesn't exist
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// Configuration with fallback options
const CONFIG = {
  CRYPTO: {
    apiUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    fallbackUrl: 'https://api.coincap.io/v2/assets',
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
    fallbackUrl: 'https://financialmodelingprep.com/api/v3',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'WMT'],
    params: {
      interval: '5m',
      range: '1d'
    }
  }
};

// Enhanced fetch function with retries and fallback
async function fetchWithRetry(url, params = {}, retries = 3, fallbackUrl = null) {
  try {
    const response = await axios.get(url, { params, timeout: 10000 });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying ${url}... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, params, retries - 1, fallbackUrl);
    }
    if (fallbackUrl) {
      console.log(`Using fallback API for ${url}`);
      return fetchWithRetry(fallbackUrl, params, 2, null);
    }
    throw error;
  }
}

// Process cryptocurrency data
async function fetchCryptoData() {
  try {
    const data = await fetchWithRetry(
      CONFIG.CRYPTO.apiUrl,
      CONFIG.CRYPTO.params,
      3,
      CONFIG.CRYPTO.fallbackUrl
    );
    
    return data.map(crypto => ({
      symbol: crypto.symbol.toUpperCase(),
      name: crypto.name,
      price: crypto.current_price,
      change24h: crypto.price_change_percentage_24h || 0,
      volume: crypto.total_volume || 0,
      sparkline: crypto.sparkline_in_7d.price,
      lastUpdated: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Failed to fetch crypto data:', error.message);
    return [];
  }
}

// Process stock data
async function fetchStockData(symbol) {
  try {
    const data = await fetchWithRetry(
      `${CONFIG.STOCKS.apiUrl}/${symbol}`,
      CONFIG.STOCKS.params,
      3,
      `${CONFIG.STOCKS.fallbackUrl}/quote-short/${symbol}`
    );
    
    // Handle different API responses
    const result = data.chart?.result?.[0] || data[0];
    if (!result) return null;

    const prices = result.indicators?.quote?.[0]?.close || [];
    const validPrices = prices.filter(price => price !== null);
    
    if (validPrices.length < 14) return null;

    return {
      symbol,
      name: result.meta?.symbol || symbol,
      price: result.meta?.regularMarketPrice || result.price || 0,
      change24h: result.meta?.regularMarketChangePercent || 0,
      volume: result.meta?.regularMarketVolume || 0,
      sparkline: validPrices,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to fetch ${symbol} data:`, error.message);
    return null;
  }
}

// Calculate technical indicators
function calculateIndicators(prices) {
  const closes = prices.slice(-100);
  return {
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema9: ti.ema({ values: closes, period: 9 }).pop() || closes[closes.length - 1],
    ema21: ti.ema({ values: closes, period: 21 }).pop() || closes[closes.length - 1],
    atr: ti.atr({
      high: closes.map(p => p * 1.01),
      low: closes.map(p => p * 0.99),
      close: closes,
      period: 14
    }).pop() || (closes[closes.length - 1] * 0.05)
  };
}

// Generate trading signals
function generateSignal(asset) {
  const indicators = calculateIndicators(asset.sparkline);
  const atrPercent = (indicators.atr / asset.price) * 100;
  
  // Calculate AI score (0-100)
  const score = Math.min(100, Math.max(0, 
    50 + (indicators.rsi - 50) * 0.5 + 
    (asset.change24h || 0) * 2
  ));

  // Generate validation reasons
  const reasons = [];
  if (indicators.rsi < 30) reasons.push('Oversold (RSI < 30)');
  if (indicators.rsi > 70) reasons.push('Overbought (RSI > 70)');
  if (indicators.ema9 > indicators.ema21) reasons.push('Bullish EMA Cross');
  if (asset.change24h > 5) reasons.push('Strong 24h gain');
  if (asset.change24h < -3) reasons.push('Significant drop');

  return {
    ...indicators,
    score: Math.round(score),
    validation: reasons.length ? reasons.join(' • ') : 'Neutral market conditions',
    risk: {
      stopLoss: asset.price * (1 - (atrPercent * 1.5 / 100)),
      takeProfit: asset.price * (1 + (atrPercent * 3 / 100)),
      positionSize: `${Math.min(10, (1 / atrPercent) * 100).toFixed(1)}%`
    },
    tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${
      asset.symbol.includes('USD') ? asset.symbol : `${asset.symbol}USD`
    }`
  };
}

// Main scan function
async function runScan() {
  try {
    console.log('Starting market scan...');
    
    // Fetch all data in parallel
    const [cryptoData, stockData] = await Promise.all([
      fetchCryptoData(),
      Promise.all(CONFIG.STOCKS.symbols.map(fetchStockData))
    ]);

    // Process and enhance data
    const cryptoResults = cryptoData.map(asset => ({
      ...asset,
      ...generateSignal(asset),
      type: 'crypto'
    }));

    const stockResults = stockData
      .filter(Boolean)
      .map(asset => ({
        ...asset,
        ...generateSignal(asset),
        type: 'stock'
      }));

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoResults
    }, null, 2));

    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockResults
    }, null, 2));

    console.log(`Scan completed: ${cryptoResults.length} cryptos, ${stockResults.length} stocks`);
  } catch (error) {
    console.error('Scan failed:', error);
    
    // Create empty files if scan fails completely
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
