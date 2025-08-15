const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');

// 1. Ensure data directory exists
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// 2. Safe API fetch with retries
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

// 3. Main scanner function
async function scan() {
  try {
    console.log('🚀 Starting scan...');
    
    // Fetch top 50 coins by market cap
    const coins = await fetchWithRetry(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&sparkline=true'
    );

    // Process signals
    const signals = coins
      .filter(coin => coin?.sparkline_in_7d?.price) // Filter invalid data
      .map(coin => {
        const prices = coin.sparkline_in_7d.price.slice(-24); // Last 24h
        return {
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h || 0,
          volume: coin.total_volume,
          rsi: ti.rsi({ values: prices, period: 14 }).pop() || 50,
          lastUpdated: new Date().toISOString()
        };
      })
      .filter(signal => signal.volume > 10000000); // $10M+ volume filter

    // Save results
    fs.writeFileSync('data/crypto.json', JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: signals
    }, null, 2));

    console.log(`✅ Scan complete. Found ${signals.length} signals.`);
    process.exit(0); // Success

  } catch (error) {
    console.error('❌ Scan failed:', error.message);
    process.exit(1); // Fail
  }
}

scan();
