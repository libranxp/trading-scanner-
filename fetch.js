const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const ti = require('technicalindicators');
const math = require('mathjs');

// Configuration
const CONFIG = {
  CRYPTO: {
    url: 'https://www.coingecko.com/en',
    filters: {
      priceMin: 0.001,
      priceMax: 100,
      volumeMin: 10000000,
      priceChangeMin: 2,
      priceChangeMax: 20
    }
  },
  STOCKS: {
    url: 'https://finance.yahoo.com/gainers',
    filters: {
      priceMin: 0.04,
      volumeMin: 500000,
      priceChangeMin: 1
    }
  }
};

async function fetchCryptoData() {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(CONFIG.CRYPTO.url, { waitUntil: 'networkidle2', timeout: 30000 });

    const cryptoData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
          symbol: cells[2]?.querySelector('a')?.textContent.trim(),
          name: cells[2]?.querySelector('.tw-hidden')?.textContent.trim(),
          price: parseFloat(cells[3]?.textContent.replace(/[$,]/g, '')),
          change24h: parseFloat(cells[4]?.textContent.replace('%', '')),
          volume: parseFloat(cells[5]?.textContent.replace(/[$,]/g, '')),
          marketCap: parseFloat(cells[6]?.textContent.replace(/[$,]/g, ''))
        };
      }).filter(item => item.symbol && !isNaN(item.price));
    });

    await browser.close();

    // Apply filters
    const filtered = cryptoData.filter(coin => 
      coin.price >= CONFIG.CRYPTO.filters.priceMin &&
      coin.price <= CONFIG.CRYPTO.filters.priceMax &&
      coin.volume >= CONFIG.CRYPTO.filters.volumeMin &&
      coin.change24h >= CONFIG.CRYPTO.filters.priceChangeMin &&
      coin.change24h <= CONFIG.CRYPTO.filters.priceChangeMax
    );

    return filtered.slice(0, 50); // Limit to top 50
  } catch (error) {
    console.error('Crypto scraping failed:', error);
    return [];
  }
}

async function fetchStockData() {
  try {
    const { data } = await axios.get(CONFIG.STOCKS.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const stockData = [];

    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      const symbol = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      const price = parseFloat($(cells[2]).text().replace(',', ''));
      const change = parseFloat($(cells[3]).text().replace('%', ''));
      const volume = parseFloat($(cells[4]).text().replace(/,/g, ''));

      stockData.push({
        symbol,
        name,
        price,
        change,
        volume
      });
    });

    // Apply filters
    return stockData.filter(stock => 
      stock.price >= CONFIG.STOCKS.filters.priceMin &&
      stock.volume >= CONFIG.STOCKS.filters.volumeMin &&
      stock.change >= CONFIG.STOCKS.filters.priceChangeMin
    ).slice(0, 50); // Limit to top 50
  } catch (error) {
    console.error('Stock scraping failed:', error);
    return [];
  }
}

async function calculateIndicators(symbol, isCrypto) {
  try {
    const url = isCrypto 
      ? `https://www.coingecko.com/en/coins/${symbol}/historical_data#panel`
      : `https://finance.yahoo.com/quote/${symbol}/history`;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const historicalData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return parseFloat(cells[1]?.textContent.replace(',', ''));
      }).filter(price => !isNaN(price)).reverse();
    });

    await browser.close();

    if (historicalData.length < 50) return null;

    const closes = historicalData.slice(-100);
    const ema5 = ti.ema({ values: closes, period: 5 }).pop();
    const ema13 = ti.ema({ values: closes, period: 13 }).pop();
    const ema50 = ti.ema({ values: closes, period: 50 }).pop();
    const rsi = ti.rsi({ values: closes.slice(-24), period: 14 }).pop();

    return {
      rsi,
      ema5,
      ema13,
      ema50,
      emaAlignment: ema5 > ema13 && ema13 > ema50,
      atr: ti.atr({
        high: closes.map(p => p * 1.01),
        low: closes.map(p => p * 0.99),
        close: closes,
        period: 14
      }).pop()
    };
  } catch (error) {
    console.error(`Indicator calculation failed for ${symbol}:`, error);
    return null;
  }
}

async function fetchNews(symbol, isCrypto) {
  try {
    const url = isCrypto
      ? `https://www.coingecko.com/en/coins/${symbol}/news`
      : `https://finance.yahoo.com/quote/${symbol}/news`;

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const newsItems = [];

    $(isCrypto ? '.card' : '.js-stream-content').each((i, el) => {
      const title = $(el).find('a').first().text().trim();
      const url = $(el).find('a').first().attr('href');
      const time = $(el).find('time').text().trim();
      
      if (title && url) {
        newsItems.push({
          title,
          url: url.startsWith('http') ? url : `https://www.coingecko.com${url}`,
          time
        });
      }
    });

    return newsItems.slice(0, 5);
  } catch (error) {
    console.error(`News fetch failed for ${symbol}:`, error);
    return [];
  }
}

async function runScan() {
  try {
    console.log('Starting scan...');
    
    const [cryptoData, stockData] = await Promise.all([
      fetchCryptoData(),
      fetchStockData()
    ]);

    // Process crypto data
    const processedCrypto = [];
    for (const coin of cryptoData.slice(0, 20)) { // Limit to top 20 for performance
      const indicators = await calculateIndicators(coin.symbol.toLowerCase(), true);
      const news = await fetchNews(coin.symbol.toLowerCase(), true);
      
      if (indicators) {
        processedCrypto.push({
          ...coin,
          ...indicators,
          news,
          type: 'crypto',
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${coin.symbol}USD`,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    // Process stock data
    const processedStocks = [];
    for (const stock of stockData.slice(0, 20)) { // Limit to top 20 for performance
      const indicators = await calculateIndicators(stock.symbol, false);
      const news = await fetchNews(stock.symbol, false);
      
      if (indicators) {
        processedStocks.push({
          ...stock,
          ...indicators,
          news,
          type: 'stock',
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${stock.symbol}`,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: processedCrypto
    }, null, 2));

    fs.writeFileSync('data/stocks.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: processedStocks
    }, null, 2));

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

runScan();
