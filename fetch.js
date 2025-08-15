const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Scanner Configuration
const SCANNER_CONFIG = {
  CRYPTO: {
    minVolume: 10000000, // $10M
    rsiRange: [40, 70],
    priceChange: 0.02 // 2%
  },
  STOCKS: {
    minVolume: 500000, // shares
    rsiRange: [45, 75],
    priceChange: 0.01 // 1%
  }
};

async function fetchTopCryptos() {
  const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 100,
      sparkline: true,
      price_change_percentage: '24h'
    }
  });
  return response.data;
}

function calculateIndicators(prices) {
  const closes = prices.map(p => p[1]);
  return {
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }),
    macd: ti.macd({ 
      values: closes, 
      fastPeriod: 12, 
      slowPeriod: 26, 
      signalPeriod: 9 
    }).pop(),
    bb: ti.bollingerbands({ values: closes, period: 20, stdDev: 2 })
  };
}

async function scan() {
  try {
    // 1. Fetch crypto data
    const cryptos = await fetchTopCryptos();
    
    // 2. Process signals
    const cryptoSignals = cryptos
      .filter(coin => coin.total_volume >= SCANNER_CONFIG.CRYPTO.minVolume)
      .map(coin => {
        const indicators = calculateIndicators(coin.sparkline_in_7d.price);
        return {
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          volume: coin.total_volume,
          rsi: indicators.rsi,
          macd: indicators.macd.histogram,
          bb: indicators.bb
        };
      })
      .filter(signal => 
        signal.rsi >= SCANNER_CONFIG.CRYPTO.rsiRange[0] &&
        signal.rsi <= SCANNER_CONFIG.CRYPTO.rsiRange[1] &&
        Math.abs(signal.change24h) >= SCANNER_CONFIG.CRYPTO.priceChange * 100
      );
    
    // 3. Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date(),
      data: cryptoSignals
    }, null, 2));
    
    console.log(`Found ${cryptoSignals.length} crypto signals`);
    
  } catch (error) {
    console.error('Scan failed:', error.message);
  }
}

scan();
