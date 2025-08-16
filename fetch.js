const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const ti = require('technicalindicators');
const math = require('mathjs');

// Fixed paths
const DATA_DIR = path.join(__dirname, '../public/data');
const CRYPTO_FILE = path.join(DATA_DIR, 'crypto.json');
const STOCKS_FILE = path.join(DATA_DIR, 'stocks.json');

// Ensure directories exist
[DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// [Rest of your existing fetch.js code with proper error handling]
// Make sure all file operations use the correct paths above
