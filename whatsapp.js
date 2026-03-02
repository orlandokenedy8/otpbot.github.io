// ============================================
// Number Quality Checker — OTP History Based
// ============================================
// Uses real OTP data from the external API to classify numbers:
//   "verified"  = received WhatsApp OTPs (proven working)
//   "likely"    = received other OTPs (active, but WhatsApp unconfirmed)
//   "unknown"   = no OTP history

const EXTERNAL_API = 'https://weak-deloris-nothing672434-fe85179d.koyeb.app';

let lastSyncTime = null;
let verifiedNumbers = new Set();   // received WhatsApp OTPs
let activeNumbers = new Set();     // received any OTPs
let stats = { verified: 0, likely: 0, total_otps: 0, last_sync: null };

// ===== SYNC OTP HISTORY =====
async function syncOTPHistory() {
    try {
        console.log('🔄 Syncing OTP history from external API...');
        const res = await fetch(EXTERNAL_API + '/api/otps?limit=1000');
        const data = await res.json();

        if (!data.success || !data.otps) {
            console.log('⚠️ No OTP data from API');
            return;
        }

        const newVerified = new Set();
        const newActive = new Set();

        for (const otp of data.otps) {
            const num = otp.number;
            if (!num) continue;

            newActive.add(num);

            // Check if sender is WhatsApp (case insensitive)
            const sender = (otp.sender || '').toLowerCase();
            if (sender.includes('whatsapp') || sender.includes('wa')) {
                newVerified.add(num);
            }
        }

        verifiedNumbers = newVerified;
        activeNumbers = newActive;
        lastSyncTime = new Date();

        stats = {
            verified: verifiedNumbers.size,
            likely: activeNumbers.size - verifiedNumbers.size,
            total_otps: data.otps.length,
            last_sync: lastSyncTime.toISOString(),
        };

        console.log(`✅ OTP Sync complete:`);
        console.log(`   📱 WhatsApp verified numbers: ${verifiedNumbers.size}`);
        console.log(`   📨 Other active numbers: ${activeNumbers.size - verifiedNumbers.size}`);
        console.log(`   📊 Total OTPs analyzed: ${data.otps.length}`);

    } catch (e) {
        console.error('OTP sync failed:', e.message);
    }
}

// ===== CHECK NUMBER QUALITY =====
function getNumberQuality(phoneNumber) {
    const cleaned = phoneNumber.replace(/[^0-9]/g, '');

    if (verifiedNumbers.has(phoneNumber) || verifiedNumbers.has(cleaned)) {
        return 'verified';  // ✅ received WhatsApp OTPs
    }
    if (activeNumbers.has(phoneNumber) || activeNumbers.has(cleaned)) {
        return 'likely';    // 📨 received other OTPs
    }
    return 'unknown';     // ❓ no history
}

// ===== UPDATE DB QUALITY TAGS =====
async function updateDatabaseQuality(db) {
    if (!db) return;

    try {
        // Add quality column if it doesn't exist
        try {
            db.prepare("ALTER TABLE numbers_pool ADD COLUMN quality TEXT DEFAULT 'unknown'").run();
        } catch (e) { /* column already exists */ }

        let updated = 0;

        // Mark WhatsApp verified numbers
        const markVerified = db.prepare("UPDATE numbers_pool SET quality = 'verified' WHERE number = ? AND quality != 'verified'");
        for (const num of verifiedNumbers) {
            const r = markVerified.run(num);
            if (r.changes > 0) updated++;
        }

        // Mark active (received other OTPs) numbers
        const markLikely = db.prepare("UPDATE numbers_pool SET quality = 'likely' WHERE number = ? AND quality NOT IN ('verified', 'likely')");
        for (const num of activeNumbers) {
            if (!verifiedNumbers.has(num)) {
                const r = markLikely.run(num);
                if (r.changes > 0) updated++;
            }
        }

        if (updated > 0) console.log(`📊 Updated quality tags for ${updated} numbers in database`);
    } catch (e) {
        console.error('DB quality update failed:', e.message);
    }
}

// ===== GET STATUS =====
function getStatus() {
    return {
        ...stats,
        verified_numbers: [...verifiedNumbers].slice(0, 20), // sample for admin
        sync_age_minutes: lastSyncTime ? Math.round((Date.now() - lastSyncTime.getTime()) / 60000) : null,
    };
}

module.exports = {
    syncOTPHistory,
    getNumberQuality,
    updateDatabaseQuality,
    getStatus,
};
