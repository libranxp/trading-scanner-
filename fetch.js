<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Trading Scanner</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    .rsi-overbought { color: #ef4444; }
    .rsi-oversold { color: #10b981; }
    .asset-card {
      transition: all 0.2s ease;
    }
    .asset-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="container mx-auto px-4 py-8">
    <header class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-gray-800 mb-2">
        <i class="fas fa-robot text-blue-500 mr-2"></i> AI Trading Scanner
      </h1>
      <div class="flex justify-center items-center space-x-4">
        <button id="refreshBtn" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
          <i class="fas fa-sync-alt mr-2"></i> Refresh Data
        </button>
        <span class="text-sm text-gray-500">
          Last update: <span id="lastUpdate" class="font-medium">--:--</span>
        </span>
      </div>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-4 bg-blue-50 border-b">
          <h2 class="text-xl font-semibold text-blue-800">
            <i class="fab fa-bitcoin text-yellow-500 mr-2"></i> Cryptocurrencies
          </h2>
        </div>
        <div id="cryptoTable" class="divide-y divide-gray-100">
          <div class="p-4 text-center text-gray-500">
            Loading data...
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-4 bg-blue-50 border-b">
          <h2 class="text-xl font-semibold text-blue-800">
            <i class="fas fa-chart-line text-blue-500 mr-2"></i> Stocks
          </h2>
        </div>
        <div id="stocksTable" class="divide-y divide-gray-100">
          <div class="p-4 text-center text-gray-500">
            Loading data...
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    class Dashboard {
      constructor() {
        this.init();
      }

      init() {
        this.setupEventListeners();
        this.loadData();
      }

      setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
          const btn = document.getElementById('refreshBtn');
          btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Loading...';
          btn.disabled = true;
          
          this.loadData().finally(() => {
            btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Refresh Data';
            btn.disabled = false;
          });
        });
      }

      async loadData() {
        try {
          // Add cache busting
          const timestamp = new Date().getTime();
          const [cryptoRes, stocksRes] = await Promise.all([
            fetch(`data/crypto.json?t=${timestamp}`).catch(() => ({ ok: false })),
            fetch(`data/stocks.json?t=${timestamp}`).catch(() => ({ ok: false }))
          ]);

          if (!cryptoRes.ok || !stocksRes.ok) {
            throw new Error('Failed to fetch data');
          }

          const cryptoData = await cryptoRes.json().catch(() => null);
          const stocksData = await stocksRes.json().catch(() => null);

          if (!cryptoData || !stocksData) {
            throw new Error('Invalid data format');
          }

          this.renderTable('cryptoTable', cryptoData.data);
          this.renderTable('stocksTable', stocksData.data);

          document.getElementById('lastUpdate').textContent = 
            new Date(cryptoData.lastUpdated).toLocaleTimeString();
        } catch (error) {
          console.error('Error:', error);
          this.showError();
        }
      }

      renderTable(containerId, assets) {
        const container = document.getElementById(containerId);
        
        if (!assets || assets.length === 0) {
          container.innerHTML = `
            <div class="p-4 text-center text-yellow-600">
              <i class="fas fa-exclamation-circle mr-2"></i>
              No data available (scan may be in progress)
            </div>`;
          return;
        }

        container.innerHTML = assets.map(asset => `
          <div class="asset-card p-4 hover:bg-gray-50">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-lg">${asset.symbol}</span>
              <span class="text-xl font-bold">$${asset.price.toFixed(2)}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="text-center ${asset.rsi > 70 ? 'rsi-overbought' : asset.rsi < 30 ? 'rsi-oversold' : ''}">
                <div class="font-medium">RSI</div>
                <div>${asset.rsi.toFixed(1)}</div>
              </div>
              <div class="text-center">
                <div class="font-medium">EMA(9)</div>
                <div>$${asset.ema9.toFixed(2)}</div>
              </div>
              <div class="text-center">
                <div class="font-medium">EMA(21)</div>
                <div>$${asset.ema21.toFixed(2)}</div>
              </div>
            </div>
          </div>
        `).join('');
      }

      showError() {
        const containers = ['cryptoTable', 'stocksTable'];
        containers.forEach(id => {
          document.getElementById(id).innerHTML = `
            <div class="p-4 text-center text-red-500">
              <i class="fas fa-exclamation-triangle mr-2"></i>
              Failed to load data. Please try refreshing.
            </div>`;
        });
      }
    }

    document.addEventListener('DOMContentLoaded', () => new Dashboard());
  </script>
</body>
</html>
