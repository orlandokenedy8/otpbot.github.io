const fs = require('fs');
const path = require('path');
const https = require('https');

const API_URL = 'https://weak-deloris-nothing672434-fe85179d.koyeb.app';
const DATA_DIR = path.join(__dirname, 'public', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fetchJSON(endpoint, outputFile) {
    return new Promise((resolve, reject) => {
        console.log(`Fetching ${endpoint}...`);
        https.get(`${API_URL}${endpoint}`, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    // Minify the JSON by parsing and stringifying it without spaces
                    const parsed = JSON.parse(data);
                    const minified = JSON.stringify(parsed);

                    fs.writeFileSync(path.join(DATA_DIR, outputFile), minified);
                    console.log(`✅ Saved ${outputFile} (${(Buffer.byteLength(minified) / 1024).toFixed(2)} KB)`);
                    resolve();
                } catch (e) {
                    console.error(`❌ Failed to parse JSON for ${outputFile}:`, e.message);
                    reject(e);
                }
            });
        }).on('error', (e) => {
            console.error(`❌ Network error fetching ${endpoint}:`, e.message);
            reject(e);
        });
    });
}

async function syncData() {
    try {
        console.log('🔄 Starting static data sync...');

        // Fetch numbers
        await fetchJSON('/api/numbers', 'numbers.json');

        // Fetch OTPs
        await fetchJSON('/api/otps?limit=200', 'otps.json');

        console.log('🎉 Data sync complete!');
    } catch (e) {
        console.error('Data sync failed:', e);
        process.exit(1);
    }
}

syncData();
