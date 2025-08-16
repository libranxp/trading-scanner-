const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const ti = require('technicalindicators');
const math = require('mathjs');

// Path configuration
const DATA_DIR = path.join(__dirname, '../public/data');
const CRYPTO_FILE = path.join(DATA_DIR, 'crypto.json');
const STOCKS_FILE = path.join(DATA_DIR, 'stocks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// [Rest of your fetch.js code remains the same, but ensure all file paths use DATA_DIR]

// Example write operation should use:
fs.writeFileSync(CRYPTO_FILE, JSON.stringify(data, null, 2));
