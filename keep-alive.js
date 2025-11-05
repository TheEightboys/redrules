// keep-alive.js
const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'https://redrules.onrender.com';

function pingServer() {
    const url = `${BACKEND_URL}/api/test`;
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`⏰ [${new Date().toISOString()}] Pinging server to keep alive...`);
    
    protocol.get(url, (res) => {
        console.log(`✅ Ping successful - Status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error(`❌ Ping failed:`, err.message);
    });
}

// Ping every 14 minutes (Render free tier sleeps after 15 minutes)
setInterval(pingServer, 14 * 60 * 1000);

// Initial ping
pingServer();

console.log('🔥 Keep-alive service started - will ping every 14 minutes');
