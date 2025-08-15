const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// Enhanced error handling
async function fetchWithRetry(url, retries = 3) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

async function fetchTopCryptos() {
  const data = await fetchWithRetry(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=true&price_change_percentage=24h'
  );
  return data.filter(coin => coin?.sparkline_in_7d?.price); // Filter invalid data
}

function calculateIndicators(prices) {
  const closes = prices.slice(-90); // Use last 90 days for stability
  return {
    rsi: ti.rsi({ values: closes, period: 14 }).pop() || 50,
    macd: ti.macd({ 
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    }).pop() || { histogram: 0 }
  };
}

async function scan() {
  try {
    console.log('Starting scan...');
    const cryptos = await fetchTopCryptos();
    
    const signals = cryptos.map(coin => {
      const indicators = calculateIndicators(coin.sparkline_in_7d.price);
      return {
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h || 0,
        volume: coin.total_volume,
        rsi: indicators.rsi,
        macdHistogram: indicators.macd.histogram,
        lastUpdated: new Date().toISOString()
      };
    }).filter(signal => 
      signal.volume > 10000000 && 
      signal.rsi >= 40 && 
      signal.rsi <= 70
    );

    // Ensure data directory exists
    if (!fs.existsSync('data')) fs.mkdirSync('data');
    
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: signals
    }, null, 2));

    console.log(`Scan completed. Found ${signals.length} signals.`);
    process.exit(0); // Explicit success exit

  } catch (error) {
    console.error('Scan failed:', error.message);
    process.exit(1); // Explicit error exit
  }
}

scan();
