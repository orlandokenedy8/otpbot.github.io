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
                    let parsed = JSON.parse(data);

                    // IF fetching numbers, don't expose all 33,000+!
                    if (endpoint.includes('/numbers') && parsed.success && parsed.numbers) {
                        const countryStats = {};
                        const sampleNumbers = [];

                        parsed.numbers.forEach(n => {
                            const key = n.countryCode || n.country;
                            if (!countryStats[key]) countryStats[key] = { count: 0, items: [] };

                            countryStats[key].count++; // Track the true available number

                            // Only keep the first 1 number per country
                            if (countryStats[key].items.length < 1) {
                                countryStats[key].items.push(n);
                            }
                        });

                        // Rebuild array assigning the real count to our samples
                        for (const key in countryStats) {
                            const stats = countryStats[key];
                            stats.items.forEach(item => {
                                item.real_total = stats.count;
                                sampleNumbers.push(item);
                            });
                        }

                        parsed.numbers = sampleNumbers;
                        parsed.total = sampleNumbers.length;
                    }

                    // IF fetching OTPs, separate them into individual files by number to protect privacy
                    if (endpoint.includes('/otps') && parsed.success && parsed.otps) {
                        const otpsDir = path.join(DATA_DIR, 'otps');
                        if (!fs.existsSync(otpsDir)) {
                            fs.mkdirSync(otpsDir, { recursive: true });
                        } else {
                            const oldFiles = fs.readdirSync(otpsDir);
                            for (const file of oldFiles) {
                                fs.unlinkSync(path.join(otpsDir, file));
                            }
                        }

                        const groups = {};
                        for (const o of parsed.otps) {
                            if (!groups[o.number]) groups[o.number] = [];
                            groups[o.number].push(o);
                        }

                        for (const num in groups) {
                            fs.writeFileSync(
                                path.join(otpsDir, `${num}.json`),
                                JSON.stringify({ success: true, otps: groups[num] })
                            );
                        }

                        // Wipe the main file completely
                        parsed.otps = [];
                        parsed.total = 0;
                        parsed.real_total = 0;
                    }

                    // Minify the JSON by parsing and stringifying it without spaces
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
