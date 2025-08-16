document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/crypto');
    const { lastUpdated, data } = await response.json();
    
    document.getElementById('update-time').textContent = new Date(lastUpdated).toLocaleString();
    
    if (data.length === 0) {
      document.getElementById('crypto-grid').innerHTML = '<p class="error">No data available. Please try again later.</p>';
      return;
    }

    renderCryptoGrid(data);
    setupSearchFilter(data);
    setupSorting(data);
    setupChart(data[0]); // Show chart for first coin by default
  } catch (error) {
    console.error('Error loading data:', error);
    document.getElementById('crypto-grid').innerHTML = `
      <p class="error">Failed to load data: ${error.message}</p>
    `;
  }
});

function renderCryptoGrid(data) {
  const grid = document.getElementById('crypto-grid');
  grid.innerHTML = data.map(coin => `
    <div class="crypto-card" data-id="${coin.id}">
      <div class="crypto-header">
        <h3>${coin.name} (${coin.symbol})</h3>
        <span class="price">$${coin.price.toLocaleString()}</span>
      </div>
      <div class="crypto-details">
        <div class="detail">
          <span>24h Change:</span>
          <span class="${coin.change24h >= 0 ? 'positive' : 'negative'}">
            ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(2)}%
          </span>
        </div>
        <div class="detail">
          <span>Volume:</span>
          <span>$${(coin.volume / 1000000).toFixed(2)}M</span>
        </div>
        <div class="detail">
          <span>Market Cap:</span>
          <span>$${(coin.marketCap / 1000000000).toFixed(2)}B</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click event to show chart
  document.querySelectorAll('.crypto-card').forEach(card => {
    card.addEventListener('click', () => {
      const coinId = card.getAttribute('data-id');
      const coin = data.find(c => c.id === coinId);
      setupChart(coin);
    });
  });
}

function setupChart(coin) {
  const ctx = document.getElementById('price-chart').getContext('2d');
  
  if (window.priceChart) {
    window.priceChart.destroy();
  }

  window.priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: coin.sparkline.length }, (_, i) => i),
      datasets: [{
        label: `${coin.name} (7d)`,
        data: coin.sparkline,
        borderColor: coin.change24h >= 0 ? '#4CAF50' : '#F44336',
        tension: 0.1,
        fill: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${coin.name} 7-Day Price Chart`
        }
      },
      scales: {
        x: { display: false },
        y: {
          title: { display: true, text: 'Price (USD)' }
        }
      }
    }
  });
}

function setupSearchFilter(data) {
  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = data.filter(coin => 
      coin.name.toLowerCase().includes(searchTerm) || 
      coin.symbol.toLowerCase().includes(searchTerm)
    );
    renderCryptoGrid(filtered);
  });
}

function setupSorting(data) {
  const sortSelect = document.getElementById('sort');
  sortSelect.addEventListener('change', (e) => {
    const sorted = [...data];
    switch(e.target.value) {
      case 'marketCap':
        sorted.sort((a, b) => b.marketCap - a.marketCap);
        break;
      case 'volume':
        sorted.sort((a, b) => b.volume - a.volume);
        break;
      case 'change24h':
        sorted.sort((a, b) => b.change24h - a.change24h);
        break;
    }
    renderCryptoGrid(sorted);
  });
}
