// ============================================
// Cross-reference numbers vs OTPs
// Creates: used_numbers.txt and freshnumbers.txt
// ============================================

const API = 'https://weak-deloris-nothing672434-fe85179d.koyeb.app';

async function main() {
    console.log('📡 Fetching all numbers...');
    const numRes = await fetch(API + '/api/numbers');
    const numData = await numRes.json();
    const allNumbers = numData.numbers || [];
    console.log(`   Found ${allNumbers.length} total numbers`);

    // Fetch OTPs with increasing limits to get as many as possible
    console.log('📨 Fetching all OTPs...');
    let allOtps = [];
    for (const limit of [1000, 5000, 10000, 50000]) {
        try {
            const otpRes = await fetch(API + '/api/otps?limit=' + limit);
            const otpData = await otpRes.json();
            if (otpData.otps && otpData.otps.length > allOtps.length) {
                allOtps = otpData.otps;
                console.log(`   Fetched ${allOtps.length} OTPs (limit=${limit})`);
            }
            if (otpData.otps && otpData.otps.length < limit) break; // got all
        } catch (e) {
            console.log(`   limit=${limit} failed: ${e.message}`);
            break;
        }
    }

    // Build set of numbers that have received OTPs
    const numbersWithOTPs = new Set();
    for (const otp of allOtps) {
        if (otp.number) numbersWithOTPs.add(otp.number);
    }
    console.log(`\n📊 Numbers that received at least 1 OTP: ${numbersWithOTPs.size}`);

    // Cross-reference
    const usedNumbers = [];
    const freshNumbers = [];

    for (const num of allNumbers) {
        if (numbersWithOTPs.has(num.number)) {
            usedNumbers.push(num.number);
        } else {
            freshNumbers.push(num.number);
        }
    }

    console.log(`✅ Used numbers (received OTPs): ${usedNumbers.length}`);
    console.log(`🆕 Fresh numbers (no OTPs): ${freshNumbers.length}`);

    // Write files
    const fs = require('fs');

    fs.writeFileSync('used_numbers.txt',
        `# Numbers that have received OTPs (${usedNumbers.length} total)\n` +
        `# Generated: ${new Date().toISOString()}\n\n` +
        usedNumbers.join('\n') + '\n'
    );

    fs.writeFileSync('freshnumbers.txt',
        `# Fresh numbers — NO OTP history found (${freshNumbers.length} total)\n` +
        `# Generated: ${new Date().toISOString()}\n\n` +
        freshNumbers.join('\n') + '\n'
    );

    console.log(`\n📄 Written: used_numbers.txt (${usedNumbers.length} numbers)`);
    console.log(`📄 Written: freshnumbers.txt (${freshNumbers.length} numbers)`);

    // Extra: show WhatsApp-specific breakdown
    const whatsappNumbers = new Set();
    for (const otp of allOtps) {
        if (otp.sender && otp.sender.toLowerCase().includes('whatsapp')) {
            whatsappNumbers.add(otp.number);
        }
    }
    console.log(`\n📱 WhatsApp OTP numbers: ${whatsappNumbers.size}`);
    console.log(`📨 Other OTP numbers: ${numbersWithOTPs.size - whatsappNumbers.size}`);
}

main().catch(console.error);
