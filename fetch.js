const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const ti = require('technicalindicators');
const math = require('mathjs');

// Configuration
const DATA_DIR = path.join(__dirname, '../data');
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 15000;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Safe number parsing
function safeParseNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? defaultValue : num;
}

// Safe data fetching with retries
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  try {
    const response = await axios({
      url,
      timeout: REQUEST_TIMEOUT,
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...options.headers
      }
    });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

// Validate and normalize crypto data
function validateCryptoData(coin) {
  if (!coin || !coin.symbol || !coin.name) return null;

  const price = safeParseNumber(coin.price);
  const change24h = safeParseNumber(coin.change24h);
  const volume = safeParseNumber(coin.volume);
  const marketCap = safeParseNumber(coin.marketCap);

  return {
    symbol: String(coin.symbol).toUpperCase().trim(),
    name: String(coin.name).trim(),
    price,
    change24h,
    volume,
    marketCap,
    lastUpdated: new Date().toISOString()
  };
}

// Validate and normalize stock data
function validateStockData(stock) {
  if (!stock || !stock.symbol || !stock.name) return null;

  const price = safeParseNumber(stock.price);
  const change = safeParseNumber(stock.change);
  const volume = safeParseNumber(stock.volume);

  return {
    symbol: String(stock.symbol).toUpperCase().trim(),
    name: String(stock.name).trim(),
    price,
    change,
    volume,
    lastUpdated: new Date().toISOString()
  };
}

// Calculate technical indicators with validation
function calculateIndicators(prices) {
  if (!Array.isArray(prices) || prices.length < 50) return null;

  const closes = prices.slice(-100);
  
  try {
    return {
      rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
      ema5: ti.ema({ values: closes, period: 5 }).pop(),
      ema13: ti.ema({ values: closes, period: 13 }).pop(),
      ema50: ti.ema({ values: closes, period: 50 }).pop(),
      atr: ti.atr({
        high: closes.map(p => p * 1.01),
        low: closes.map(p => p * 0.99),
        close: closes,
        period: 14
      }).pop()
    };
  } catch (error) {
    console.error('Indicator calculation error:', error);
    return null;
  }
}

// Main scanning function
async function runScan() {
  try {
    console.log('Starting market scan...');
    
    // [Previous scraping code remains the same, but wrap all in try/catch]
    
    // Save validated data
    fs.writeFileSync(
      path.join(DATA_DIR, 'crypto.json'),
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: cryptoData.filter(Boolean).slice(0, 50) // Ensure valid data and limit
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(DATA_DIR, 'stocks.json'),
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: stockData.filter(Boolean).slice(0, 50) // Ensure valid data and limit
      }, null, 2)
    );

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
    
    // Write empty datasets on error
    const errorData = {
      lastUpdated: new Date().toISOString(),
      error: error.message,
      data: []
    };
    
    fs.writeFileSync(path.join(DATA_DIR, 'crypto.json'), JSON.stringify(errorData));
    fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(errorData));
  }
}

runScan();
