const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

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
    params: {
      interval: '5m',
      range: '1d'
    }
  }
};

async function fetchAssets(type) {
  try {
    const { apiUrl, params } = CONFIG[type];
    const response = await axios.get(
      type === 'CRYPTO' ? apiUrl : `${apiUrl}/${params.symbol}`,
      { params, timeout: 15000 }
    );
    return type === 'CRYPTO' ? response.data : [response.data];
  } catch (error) {
    console.error(`Error fetching ${type}:`, error.message);
    return [];
  }
}

function calculateIndicators(prices) {
  const closes = prices.slice(-100);
  return {
    price: closes[closes.length - 1],
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema9: ti.ema({ values: closes, period: 9 }).pop(),
    ema21: ti.ema({ values: closes, period: 21 }).pop()
  };
}

async function processAssets() {
  if (!fs.existsSync('data')) fs.mkdirSync('data');

  try {
    const [cryptoData, stockData] = await Promise.all([
      fetchAssets('CRYPTO'),
      fetchAssets('STOCKS')
    ]);

    const results = {
      crypto: cryptoData.map(asset => ({
        symbol: asset.symbol.toUpperCase(),
        name: asset.name,
        ...calculateIndicators(asset.sparkline_in_7d.price),
        lastUpdated: new Date().toISOString()
      })),
      stocks: stockData.map(asset => ({
        symbol: asset.chart.result[0].meta.symbol,
        name: asset.chart.result[0].meta.symbol,
        ...calculateIndicators(asset.chart.result[0].indicators.quote[0].close),
        lastUpdated: new Date().toISOString()
      }))
    };

    fs.writeFileSync('data/crypto.json', JSON.stringify(results.crypto, null, 2));
    fs.writeFileSync('data/stocks.json', JSON.stringify(results.stocks, null, 2));

    console.log('Scan completed successfully');
  } catch (error) {
    console.error('Processing failed:', error);
  }
}

processAssets();
