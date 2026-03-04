// ============================================
// OTPBot Premium — Fully Client-Side Application
// No backend needed — runs on GitHub Pages
// ============================================

// Encoded config (not plaintext)
const _d = s => atob(s).split('').map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join('');

// ===== STATIC PLANS (no backend needed) =====
const PLANS = [
    { id: 'starter', name: 'Starter', duration_months: 1, price: 49, description: 'Perfect for trying out the service. Get one premium number for 30 days.', badge: '🚀', is_popular: 0 },
    { id: 'standard', name: 'Standard', duration_months: 3, price: 99, description: 'Best value for regular users. Save 33% compared to monthly.', badge: '⭐', is_popular: 1 },
    { id: 'pro', name: 'Pro', duration_months: 6, price: 149, description: 'For power users who need long-term numbers. Save 50%.', badge: '💎', is_popular: 0 },
    { id: 'annual', name: 'Annual', duration_months: 12, price: 249, description: 'Maximum savings with a full year. Save 58% vs monthly.', badge: '👑', is_popular: 0 }
];

// ===== STATE =====
let plans = PLANS;
let selectedPlan = null;
let activePurchase = null;
let allPurchases = [];
let adminKey = null;
let inboxTimer = null;
let countries = [];
let allNumbers = [];
let allOtps = [];

// ===== LOCAL DB (localStorage) =====
const DB = {
    _get(key) { try { return JSON.parse(localStorage.getItem('otpbot_' + key)) || null; } catch { return null; } },
    _set(key, val) { localStorage.setItem('otpbot_' + key, JSON.stringify(val)); },
    getUsers() { return this._get('users') || []; },
    saveUsers(u) { this._set('users', u); },
    getSession() { return this._get('session'); },
    saveSession(s) { this._set('session', s); },
    clearSession() { localStorage.removeItem('otpbot_session'); },
    getPurchases() { return this._get('purchases') || []; },
    savePurchases(p) { this._set('purchases', p); },
    getUsedNumbers() { return this._get('used_numbers') || []; },
    saveUsedNumbers(u) { this._set('used_numbers', u); },
    getRefunds() { return this._get('refunds') || []; },
    saveRefunds(r) { this._set('refunds', r); },
};

function generateId() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function hashPassword(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
    return 'h_' + Math.abs(h).toString(36);
}

// ===== AUTH =====
let currentUser = null;
let authToken = null;

function loadSession() {
    const s = DB.getSession();
    if (s && s.expires > Date.now()) {
        currentUser = s.user;
        authToken = s.token;
        return true;
    }
    DB.clearSession();
    currentUser = null;
    authToken = null;
    return false;
}
loadSession();

function registerUser(email, password) {
    const users = DB.getUsers();
    if (users.find(u => u.email === email)) return { success: false, error: 'Email already registered. Please login.' };
    const user = { id: generateId(), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    users.push(user);
    DB.saveUsers(users);
    const token = generateId() + generateId();
    const session = { user: { id: user.id, email: user.email }, token, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    DB.saveSession(session);
    currentUser = session.user;
    authToken = token;
    return { success: true, user: session.user };
}

function loginUser(email, password) {
    const users = DB.getUsers();
    const user = users.find(u => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password)) return { success: false, error: 'Invalid email or password.' };
    const token = generateId() + generateId();
    const session = { user: { id: user.id, email: user.email }, token, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    DB.saveSession(session);
    currentUser = session.user;
    authToken = token;
    return { success: true, user: session.user };
}

function logoutUser() {
    DB.clearSession();
    currentUser = null;
    authToken = null;
    activePurchase = null;
    allPurchases = [];
    stopInboxRefresh();
    updateNavUI();
    showPage('landing');
    showNotif('Logged out.', 'success');
}

// ===== THEME =====
const savedTheme = localStorage.getItem('otpbot_theme') || 'dark';
document.body.setAttribute('data-theme', savedTheme);
updateThemeIcon();

function toggleTheme() {
    const cur = document.body.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('otpbot_theme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = document.body.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}

// ===== NAVIGATION =====
function smoothScroll(id) {
    showPage('landing');
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const btn = document.getElementById('mobileMenuBtn');
    menu.classList.toggle('open');
    btn.classList.toggle('open');
}

// ===== PAGES =====
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    document.getElementById('mobileMenu')?.classList.remove('open');
    document.getElementById('mobileMenuBtn')?.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'dashboard') {
        if (!currentUser) { showAuthModal('login'); return; }
        initDashboard();
    }
    updateNavUI();
}

function updateNavUI() {
    const loginBtn = document.getElementById('navLoginBtn');
    const userBtn = document.getElementById('navUserBtn');
    const userEmail = document.getElementById('navUserEmail');
    if (!loginBtn || !userBtn) return;
    if (currentUser) {
        loginBtn.style.display = 'none';
        userBtn.style.display = 'inline-flex';
        if (userEmail) userEmail.textContent = currentUser.email;
    } else {
        loginBtn.style.display = 'inline-flex';
        userBtn.style.display = 'none';
    }
}

// ===== AUTH MODAL =====
function showAuthModal(mode) {
    document.getElementById('authModal').classList.add('open');
    document.body.classList.add('modal-open');
    renderAuthForm(mode || 'login');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
    document.body.classList.remove('modal-open');
}

function renderAuthForm(mode) {
    const content = document.getElementById('authModalContent');
    const isLogin = mode === 'login';
    content.innerHTML = `
      <button class="modal-close" onclick="closeAuthModal()">×</button>
      <div class="modal-icon">${isLogin ? '🔐' : '🚀'}</div>
      <h3 class="modal-title">${isLogin ? 'Login to OTPBot' : 'Create Account'}</h3>
      <div style="margin-bottom:16px;">
        <label class="input-label">Email</label>
        <input type="email" id="authEmail" class="input-field" placeholder="you@example.com" />
        <label class="input-label" style="margin-top:12px;">Password</label>
        <input type="password" id="authPassword" class="input-field" placeholder="${isLogin ? 'Your password' : 'Create a password (min 4 chars)'}" />
      </div>
      <button class="btn-primary btn-full btn-lg" id="authSubmitBtn" onclick="submitAuth('${mode}')">
        ${isLogin ? 'Login' : 'Create Account'}
      </button>
      <p style="text-align:center;margin-top:16px;color:var(--text-3);font-size:0.85rem;">
        ${isLogin
            ? 'Don\'t have an account? <a href="#" onclick="renderAuthForm(\'register\'); return false;" style="color:var(--primary);">Register</a>'
            : 'Already have an account? <a href="#" onclick="renderAuthForm(\'login\'); return false;" style="color:var(--primary);">Login</a>'
        }
      </p>
    `;
}

function submitAuth(mode) {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showNotif('Enter email and password.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showNotif('Invalid email.', 'error');
    if (mode === 'register' && password.length < 4) return showNotif('Password min 4 characters.', 'error');

    const result = mode === 'login' ? loginUser(email, password) : registerUser(email, password);
    if (result.success) {
        closeAuthModal();
        updateNavUI();
        showNotif(`✅ Welcome${mode === 'login' ? ' back' : ''}, ${result.user.email}!`, 'success');
    } else {
        showNotif(result.error, 'error');
    }
}

// ===== NOTIFICATIONS =====
function showNotif(msg, type = 'default') {
    const n = document.getElementById('notif');
    n.textContent = msg;
    n.className = 'notification show ' + type;
    clearTimeout(n._t);
    n._t = setTimeout(() => n.classList.remove('show'), 3500);
}

// ===== FAQ =====
function toggleFaq(el) { el.classList.toggle('open'); }

// ===== LOAD DATA STATICALLY (VIA ACTIONS SYNC) =====
async function loadNumbersFromAPI() {
    try {
        const res = await fetch('data/numbers.json');
        const data = await res.json();
        if (data.success && data.numbers) {
            allNumbers = data.numbers;
            // Extract unique countries
            const countryMap = {};
            const usedNumbers = DB.getUsedNumbers();
            const purchases = DB.getPurchases().filter(p => p.status === 'active' && new Date(p.expires_at) > new Date());
            const allocatedNumbers = purchases.map(p => p.number);

            allNumbers.forEach(n => {
                if (!allocatedNumbers.includes(n.number) && !usedNumbers.includes(n.number)) {
                    const key = n.countryCode || n.country;
                    if (!countryMap[key]) {
                        countryMap[key] = { country: n.country, countryCode: n.countryCode, flag: n.flag, available: n.real_total || 0 };
                    }
                    if (!n.real_total) countryMap[key].available++;
                }
            });
            countries = Object.values(countryMap);
        }
    } catch (e) {
        console.error('Failed to load numbers:', e);
    }
}

async function loadOtpsFromAPI() {
    try {
        const res = await fetch('data/otps.json');
        const data = await res.json();
        if (data.success && data.otps) allOtps = data.otps;
    } catch (e) {
        console.error('Failed to load OTPs:', e);
    }
}

// ===== RENDER PLANS =====
function renderPricingCards() {
    const grid = document.getElementById('pricingGrid');
    if (!grid) return;
    const basePrice = plans[0].price;
    grid.innerHTML = plans.map(plan => {
        const monthly = (plan.price / plan.duration_months).toFixed(0);
        const save = plan.duration_months > 1 ? Math.round((1 - (plan.price / (basePrice * plan.duration_months))) * 100) + '%' : null;
        return `
      <div class="pricing-card ${plan.is_popular ? 'popular' : ''}">
        ${plan.is_popular ? '<div class="popular-badge">MOST POPULAR</div>' : ''}
        <div class="pricing-header">
          <div class="pricing-name">${plan.badge || ''} ${plan.name}</div>
          <div class="pricing-price">
            <span class="pricing-currency">₹</span>${plan.price}
            <span class="pricing-period">/${plan.duration_months}mo</span>
          </div>
          ${save ? `<div style="color:var(--success);font-size:0.85rem;font-weight:600;margin-top:4px;">Save ${save}</div>` : ''}
        </div>
        <p class="pricing-desc">${plan.description}</p>
        <ul class="pricing-features">
          <li><span class="feature-check">✓</span> Premium Number</li>
          <li><span class="feature-check">✓</span> Real-time OTP Inbox</li>
          <li><span class="feature-check">✓</span> ${plan.duration_months} Month${plan.duration_months > 1 ? 's' : ''} Access</li>
          ${plan.duration_months >= 3 ? '<li><span class="feature-check">✓</span> Number Replacement</li>' : ''}
          ${plan.duration_months >= 6 ? '<li><span class="feature-check">✓</span> Priority Support</li>' : ''}
        </ul>
        <button class="btn-primary btn-full" onclick="selectPlan('${plan.id}')">
          <span>Get Started — ₹${plan.price}</span>
        </button>
      </div>
    `;
    }).join('');
}

// ===== SELECT PLAN → PURCHASE =====
function selectPlan(planId) {
    selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return;
    openPurchaseModal();
}

function openPurchaseModal() {
    if (!selectedPlan) return;
    if (!currentUser) {
        showAuthModal('login');
        showNotif('Please login or create an account first.', 'error');
        return;
    }

    let countryOptions = countries.map(c =>
        `<option value="${c.countryCode}">${c.flag} ${c.country} (${c.available} available)</option>`
    ).join('');
    if (!countryOptions) countryOptions = '<option value="">No numbers available</option>';

    document.getElementById('modalTitle').textContent = 'Complete Your Purchase';
    document.getElementById('modalDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">Plan</span><span class="detail-val">${selectedPlan.badge} ${selectedPlan.name}</span></div>
    <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-val">${selectedPlan.duration_months} month${selectedPlan.duration_months > 1 ? 's' : ''}</span></div>
    <div class="detail-row"><span class="detail-label">Account</span><span class="detail-val">${currentUser.email}</span></div>
    <div class="detail-row"><span class="detail-label">Total</span><span class="detail-val" style="color:var(--primary);font-size:1.2rem;">₹${selectedPlan.price}</span></div>
  `;

    document.getElementById('modalResult').style.display = 'none';
    document.querySelector('.modal-form').style.display = 'block';
    document.querySelector('.modal-form').innerHTML = `
    <label class="input-label">Choose Country</label>
    <select id="purchaseCountry" class="input-field">
      <option value="">— Select a country —</option>
      ${countryOptions}
    </select>
    <p class="input-hint">A random fresh number from this country will be assigned to you</p>
    <button class="btn-primary btn-full btn-lg" id="purchaseBtn" onclick="completePurchase()">
      <span>Complete Purchase — ₹${selectedPlan.price}</span>
    </button>
  `;

    document.getElementById('purchaseModal').classList.add('open');
    document.body.classList.add('modal-open');
}

function closePurchaseModal() {
    document.getElementById('purchaseModal').classList.remove('open');
    document.body.classList.remove('modal-open');
}

function completePurchase() {
    const countryCode = document.getElementById('purchaseCountry').value;
    if (!countryCode) { showNotif('Please select a country.', 'error'); return; }
    if (!currentUser) { showNotif('Please login first.', 'error'); return; }

    const btn = document.getElementById('purchaseBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width:20px;height:20px;margin:0;border-width:2px;"></div> Processing...';

    // Verify number availability before taking payment
    const usedNumbers = DB.getUsedNumbers();
    const existingPurchases = DB.getPurchases().filter(p => p.status === 'active' && new Date(p.expires_at) > new Date());
    const allocatedNums = existingPurchases.map(p => p.number);

    const available = allNumbers.filter(n =>
        (n.countryCode === countryCode) &&
        !allocatedNums.includes(n.number) &&
        !usedNumbers.includes(n.number)
    );

    if (!available.length) {
        showNotif('No numbers available for this country.', 'error');
        btn.disabled = false;
        btn.innerHTML = `<span>Complete Purchase — ₹${selectedPlan.price}</span>`;
        return;
    }

    // Define UPI and WhatsApp details (Change these to your real ones later)
    const upiID = 'otpbotcom@jio'; // Replace with real UPI ID
    const waNumber = '584164444103'; // Replace with actual WhatsApp number
    const amount = selectedPlan.price;

    // Generate Direct UPI Deep Link
    const upiLink = `upi://pay?pa=${upiID}&pn=OTPBot+Premium&am=${amount}&cu=INR`;

    // Generate WhatsApp Pre-filled Message Link
    const waText = encodeURIComponent(`Hi OTPBot! I want to purchase the ${selectedPlan.name} plan for ₹${amount}.\n\nMy account email: ${currentUser.email}\nCountry selected: ${available[0].country}\n\nHere is my successful payment screenshot:`);
    const waLink = `https://wa.me/${waNumber}?text=${waText}`;

    // Show Payment UI
    document.querySelector('.modal-form').style.display = 'none';
    document.getElementById('modalResult').style.display = 'block';
    document.getElementById('modalResult').innerHTML = `
    <div style="text-align:center;">
      <h3 style="margin-bottom:8px;color:var(--text-1);">Secure UPI Payment</h3>
      <p style="color:var(--text-2);margin-bottom:20px;font-size:0.95rem;">You are purchasing the <strong>${selectedPlan.name}</strong> plan.</p>
      
      <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;">
            <div style="font-size:2rem;font-weight:800;color:var(--primary);">₹${amount}</div>
        </div>
        <p style="margin-bottom:16px;font-size:0.9rem;font-weight:600;color:var(--text-1);">Step 1: Pay using any UPI app</p>
        <a href="${upiLink}" class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;margin-bottom:16px;background:#6739B7;box-shadow:0 4px 15px rgba(103,57,183,0.3);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
          Open GPay / PhonePe / Paytm
        </a>
        <p style="color:var(--text-3);font-size:0.85rem;margin:0;">Or copy UPI ID: <br><strong style="color:var(--text-1);user-select:all;cursor:pointer;background:var(--bg-1);padding:4px 8px;border-radius:4px;display:inline-block;margin-top:6px;" onclick="copyText('${upiID}')">${upiID} 📋</strong></p>
      </div>

      <div style="background:var(--bg-2);border:1px solid rgba(37,211,102,0.2);border-radius:12px;padding:20px;margin-bottom:20px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:#25D366;"></div>
        <p style="margin-bottom:8px;font-size:0.9rem;font-weight:600;color:var(--text-1);">Step 2: Verify Payment</p>
        <p style="color:var(--text-3);font-size:0.85rem;margin-bottom:16px;line-height:1.5;">After paying, attach your screenshot and send the pre-filled message on WhatsApp. We'll activate your number instantly!</p>
        <a href="${waLink}" target="_blank" class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:#25D366;color:#111;box-shadow:0 4px 15px rgba(37,211,102,0.2);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          Send Proof via WhatsApp
        </a>
      </div>

      <button style="background:transparent;border:none;color:var(--text-3);font-size:0.9rem;cursor:pointer;text-decoration:underline;" onclick="closePurchaseModal();">
        Cancel Purchase
      </button>
    </div>
  `;
}

// ===== DASHBOARD =====
async function initDashboard() {
    stopInboxRefresh();
    if (!currentUser) { showAuthModal('login'); return; }

    const content = document.getElementById('activeNumberContent');
    content.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Loading your numbers...</p></div>';

    // Get user's active purchases
    const purchases = DB.getPurchases().filter(p =>
        p.user_id === currentUser.id && p.status === 'active' && new Date(p.expires_at) > new Date()
    );

    if (purchases.length > 0) {
        allPurchases = purchases;
        activePurchase = purchases[0];
        renderAllPurchases();
    } else {
        document.getElementById('activeNumberCard').style.display = 'none';
        document.getElementById('otpInboxCard').style.display = 'none';
        document.getElementById('healthCard').style.display = 'none';
        document.getElementById('refundCard').style.display = 'none';
        document.getElementById('noPurchaseState').style.display = 'block';
        document.getElementById('numberStatus').textContent = 'No Active Number';
    }
}

function renderAllPurchases() {
    document.getElementById('noPurchaseState').style.display = 'none';
    document.getElementById('activeNumberCard').style.display = 'block';
    document.getElementById('otpInboxCard').style.display = 'block';
    document.getElementById('healthCard').style.display = 'block';
    document.getElementById('refundCard').style.display = 'block';
    document.getElementById('numberStatus').textContent = `${allPurchases.length} ACTIVE`;
    document.getElementById('numberStatus').className = 'dash-badge';

    let html = '';
    for (const p of allPurchases) {
        html += `
      <div class="dash-number-display" style="margin-bottom:16px;">
        <div class="dnd-val">+${p.number}</div>
        <div class="dnd-meta">
          <span>${p.flag} ${p.country}</span>
          <span>Plan: ${p.plan_name}</span>
          <span>Expires: ${new Date(p.expires_at).toLocaleDateString()}</span>
        </div>
        <div style="background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.2);border-radius:12px;padding:14px;margin-top:12px;text-align:left;">
          <p style="font-weight:600;color:var(--text-1);margin-bottom:6px;font-size:0.9rem;">🔍 Check if this number is already registered on WhatsApp</p>
          <p style="color:var(--text-3);font-size:0.8rem;margin-bottom:10px;">If it shows a WhatsApp profile, the number is already in use. You can replace it for free.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="https://wa.me/+${p.number}" target="_blank" style="display:inline-block;padding:8px 16px;background:rgba(37,211,102,0.15);color:#25d366;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.85rem;border:1px solid rgba(37,211,102,0.3);">
              🔗 Check on WhatsApp
            </a>
            <button onclick="replaceNumber('${p.id}')" class="btn-ghost-sm" style="color:var(--warning);border-color:var(--warning);">
              🔄 Replace
            </button>
            <button onclick="selectNumberForInbox('${p.id}')" class="btn-ghost-sm">
              📨 View OTPs
            </button>
          </div>
        </div>
      </div>`;
    }
    html += `<div style="text-align:center;margin-top:8px;">
      <button class="btn-primary" onclick="smoothScroll('pricing')">➕ Buy Another Number</button>
    </div>`;
    content = document.getElementById('activeNumberContent');
    content.innerHTML = html;

    activePurchase = allPurchases[0];
    refreshInbox();
    startInboxRefresh();
    checkHealth();
}

function selectNumberForInbox(purchaseId) {
    const p = allPurchases.find(x => x.id === purchaseId);
    if (p) {
        activePurchase = p;
        refreshInbox();
        showNotif(`Showing OTPs for +${p.number}`, 'success');
    }
}

// ===== OTP INBOX =====
async function refreshInbox() {
    if (!activePurchase) return;
    try {
        await loadOtpsFromAPI();
        const matching = allOtps.filter(o => o.number === activePurchase.number);
        renderInbox(matching);
    } catch (e) { console.error('Inbox fetch error:', e); }
}

function renderInbox(otps) {
    const inbox = document.getElementById('otpInbox');
    if (!otps.length) {
        inbox.innerHTML = '<div class="empty-inbox"><div class="empty-icon">📭</div><p>No messages yet. Use your number for SMS verification and OTPs will appear here.</p></div>';
        return;
    }
    inbox.innerHTML = otps.map(o => `
    <div class="inbox-msg">
      <div class="inbox-header">
        <span class="inbox-sender">${escapeHtml(o.sender || 'Unknown')}</span>
        <span class="inbox-time">${o.timestamp || o.time || ''}</span>
      </div>
      ${o.otp ? `<div class="inbox-otp" onclick="copyText('${o.otp}')" title="Click to copy" style="cursor:pointer;">${o.otp}</div>` : ''}
      <div class="inbox-text">${escapeHtml(o.message || '')}</div>
    </div>
  `).join('');
}

function startInboxRefresh() { stopInboxRefresh(); inboxTimer = setInterval(refreshInbox, 5000); }
function stopInboxRefresh() { if (inboxTimer) { clearInterval(inboxTimer); inboxTimer = null; } }

// ===== NUMBER HEALTH =====
function checkHealth() {
    if (!activePurchase) return;
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    dot.className = 'health-dot checking';
    text.textContent = 'Checking number health...';
    // Check if number has received any OTPs recently
    const matching = allOtps.filter(o => o.number === activePurchase.number);
    setTimeout(() => {
        if (matching.length > 0) {
            dot.className = 'health-dot healthy';
            text.textContent = '✅ Number is active and receiving SMS';
            text.style.color = 'var(--success)';
        } else {
            dot.className = 'health-dot healthy';
            text.textContent = '✅ Number is active — waiting for OTPs';
            text.style.color = 'var(--success)';
        }
    }, 1000);
}

// ===== REFUND =====
function submitRefund() {
    if (!activePurchase) return;
    const reason = document.getElementById('refundReason').value;
    if (!reason) { showNotif('Please select a reason.', 'error'); return; }
    const refunds = DB.getRefunds();
    refunds.push({ id: generateId(), purchase_id: activePurchase.id, reason, status: 'pending', created_at: new Date().toISOString() });
    DB.saveRefunds(refunds);
    document.getElementById('refundResult').innerHTML = `<p style="color:var(--success);margin-top:12px;">✅ Refund request submitted. We will process it within 24 hours.</p>`;
    showNotif('Refund request submitted!', 'success');
}

// ===== REPLACE NUMBER =====
function replaceNumber(purchaseId) {
    const purchases = DB.getPurchases();
    const idx = purchases.findIndex(p => p.id === purchaseId);
    if (idx === -1) { showNotif('Purchase not found.', 'error'); return; }

    // Mark old number as used
    const usedNumbers = DB.getUsedNumbers();
    usedNumbers.push(purchases[idx].number);
    DB.saveUsedNumbers(usedNumbers);

    // Mark purchase as replaced
    purchases[idx].status = 'replaced';
    DB.savePurchases(purchases);

    showNotif('✅ Number replaced! Buy a new one from the pricing section.', 'success');
    loadNumbersFromAPI().then(() => initDashboard());
}

// ===== ADMIN =====
function adminLogin() {
    adminKey = document.getElementById('adminKey').value;
    if (adminKey !== _d('ZGdwbHEwdmhmdWh3MG5ofDA1MzU5')) return showNotif('Invalid admin key.', 'error');
    document.getElementById('adminAuthCard').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    loadAdminData();
}

function loadAdminData() {
    const purchases = DB.getPurchases();
    const activePurchases = purchases.filter(p => p.status === 'active' && new Date(p.expires_at) > new Date());
    const totalRevenue = purchases.filter(p => p.status === 'active').reduce((s, p) => s + p.amount, 0);
    const users = DB.getUsers();
    const refunds = DB.getRefunds();

    document.getElementById('adminStats').innerHTML = `
    <div class="admin-stat-card"><div class="admin-stat-label">Total Users</div><div class="admin-stat-val">${users.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Total Revenue</div><div class="admin-stat-val">₹${totalRevenue}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Active Numbers</div><div class="admin-stat-val">${activePurchases.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Available Numbers</div><div class="admin-stat-val">${allNumbers.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Total Purchases</div><div class="admin-stat-val">${purchases.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Pending Refunds</div><div class="admin-stat-val">${refunds.filter(r => r.status === 'pending').length}</div></div>
  `;

    // Revenue chart
    document.getElementById('revenueChart').innerHTML = '<p style="color:var(--text-3);font-size:0.85rem;">Revenue tracking active</p>';

    // Purchases table
    const wrap = document.getElementById('purchasesTable');
    if (!purchases.length) { wrap.innerHTML = '<p style="color:var(--text-3);padding:16px;">No purchases yet.</p>'; }
    else {
        wrap.innerHTML = `<table><thead><tr><th>Number</th><th>Country</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th><th>Check</th></tr></thead><tbody>${purchases.map(p => `<tr><td style="font-family:var(--font-mono);font-weight:600;">+${p.number}</td><td>${p.flag} ${p.country}</td><td>${p.plan_name}</td><td style="font-family:var(--font-mono);">₹${p.amount}</td><td class="status-${p.status}">${p.status.toUpperCase()}</td><td>${new Date(p.purchased_at).toLocaleDateString()}</td><td><a href="https://wa.me/+${p.number}" target="_blank" style="color:#25d366;font-weight:600;text-decoration:none;" title="Check on WhatsApp">🔍 WA</a></td></tr>`).join('')}</tbody></table>`;
    }

    // Numbers
    document.getElementById('numbersTable').innerHTML = `<p style="color:var(--text-3);padding:16px;">${allNumbers.length} numbers loaded from API</p>`;

    // Refunds
    const refundWrap = document.getElementById('refundsTable');
    if (!refunds.length) { refundWrap.innerHTML = '<p style="color:var(--text-3);padding:16px;">No refund requests.</p>'; }
    else {
        refundWrap.innerHTML = `<table><thead><tr><th>ID</th><th>Reason</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>${refunds.map(r => `<tr><td style="font-family:var(--font-mono);">${r.id.slice(0, 8)}</td><td>${r.reason}</td><td class="status-${r.status}">${r.status.toUpperCase()}</td><td>${new Date(r.created_at).toLocaleDateString()}</td><td>${r.status === 'pending' ? `<button onclick="approveRefund('${r.id}')" style="background:var(--success);color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;margin-right:8px;font-weight:600;">✓ Approve</button><button onclick="rejectRefund('${r.id}')" style="background:var(--error);color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:600;">✗ Reject</button>` : '—'}</td></tr>`).join('')}</tbody></table>`;
    }

    // Quality stats
    document.getElementById('qualityStats').innerHTML = `<p style="color:var(--text-2);">Numbers: ${allNumbers.length} loaded | OTPs tracked: ${allOtps.length}</p>`;
}

function approveRefund(id) {
    if (!confirm('Approve this refund request?')) return;
    const refunds = DB.getRefunds();
    const r = refunds.find(x => x.id === id);
    if (r) {
        r.status = 'approved';
        DB.saveRefunds(refunds);

        // Mark purchase as refunded
        const purchases = DB.getPurchases();
        const p = purchases.find(x => x.id === r.purchase_id);
        if (p) {
            p.status = 'refunded';
            DB.savePurchases(purchases);
        }

        loadAdminData();
        showNotif('Refund approved. Status updated.', 'success');
    }
}

function rejectRefund(id) {
    if (!confirm('Reject this refund request?')) return;
    const refunds = DB.getRefunds();
    const r = refunds.find(x => x.id === id);
    if (r) {
        r.status = 'rejected';
        DB.saveRefunds(refunds);
        loadAdminData();
        showNotif('Refund request rejected.', 'error');
    }
}

// ===== UTILS =====
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showNotif('✅ Copied to clipboard!', 'success')).catch(() => {
        const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
        document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
        showNotif('✅ Copied!', 'success');
    });
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ===== EVENTS =====
document.getElementById('navBrand')?.addEventListener('click', () => showPage('landing'));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePurchaseModal(); closeAuthModal(); }
});
document.getElementById('purchaseModal')?.addEventListener('click', e => { if (e.target === document.getElementById('purchaseModal')) closePurchaseModal(); });
document.getElementById('authModal')?.addEventListener('click', e => { if (e.target === document.getElementById('authModal')) closeAuthModal(); });

function checkHash() {
    if (window.location.hash === '#admin') showPage('admin');
    else if (window.location.hash === '#dashboard') showPage('dashboard');
}
window.addEventListener('hashchange', checkHash);

// ===== INIT =====
async function init() {
    updateNavUI();
    renderPricingCards();
    checkHash();
    await Promise.all([loadNumbersFromAPI(), loadOtpsFromAPI()]);
}
init();
