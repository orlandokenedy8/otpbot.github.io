// ============================================
// OTPBot Premium — Application Logic
// ============================================

// API Base — auto-detect: local dev vs production (GitHub Pages → Koyeb backend)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://otpbot-api-orlandokenedy8.koyeb.app';

// ===== STATE =====
let plans = [];
let selectedPlan = null;
let activePurchase = null;
let allPurchases = [];
let adminKey = null;
let inboxTimer = null;
let countries = [];
let authToken = localStorage.getItem('otpbot_token') || null;
let currentUser = JSON.parse(localStorage.getItem('otpbot_user') || 'null');

function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = 'Bearer ' + authToken;
    return h;
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
        if (!authToken) { showAuthModal('login'); return; }
        initDashboard();
    }
    updateNavUI();
}

function updateNavUI() {
    const loginBtn = document.getElementById('navLoginBtn');
    const userBtn = document.getElementById('navUserBtn');
    const userEmail = document.getElementById('navUserEmail');
    if (!loginBtn || !userBtn) return;
    if (authToken && currentUser) {
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
    const modal = document.getElementById('authModal');
    modal.classList.add('open');
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

async function submitAuth(mode) {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showNotif('Enter email and password.', 'error');

    const btn = document.getElementById('authSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Please wait...';

    try {
        const url = mode === 'login' ? '/api/login' : '/api/register';
        const res = await fetch(API_BASE + url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('otpbot_token', authToken);
            localStorage.setItem('otpbot_user', JSON.stringify(currentUser));
            closeAuthModal();
            updateNavUI();
            showNotif(`✅ Welcome${mode === 'login' ? ' back' : ''}, ${data.user.email}!`, 'success');
        } else {
            showNotif(data.error || 'Failed.', 'error');
            btn.disabled = false;
            btn.textContent = mode === 'login' ? 'Login' : 'Create Account';
        }
    } catch (e) {
        showNotif('Network error.', 'error');
        btn.disabled = false;
        btn.textContent = mode === 'login' ? 'Login' : 'Create Account';
    }
}

async function logout() {
    try {
        await fetch(API_BASE + '/api/logout', {
            method: 'POST',
            headers: authHeaders()
        });
    } catch (e) { }
    authToken = null;
    currentUser = null;
    activePurchase = null;
    allPurchases = [];
    localStorage.removeItem('otpbot_token');
    localStorage.removeItem('otpbot_user');
    stopInboxRefresh();
    updateNavUI();
    showPage('landing');
    showNotif('Logged out.', 'success');
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
function toggleFaq(el) {
    el.classList.toggle('open');
}

// ===== LOAD PLANS =====
async function loadPlans() {
    try {
        const res = await fetch(API_BASE + '/api/plans');
        const data = await res.json();
        if (data.success) {
            plans = data.plans;
            renderPricingCards();
        }
    } catch (e) {
        console.error('Failed to load plans:', e);
        document.getElementById('pricingGrid').innerHTML = '<p style="color:var(--text-2);text-align:center;grid-column:1/-1;">Failed to load plans. Please refresh.</p>';
    }
}

// ===== LOAD COUNTRIES =====
async function loadCountries() {
    try {
        const res = await fetch(API_BASE + '/api/countries');
        const data = await res.json();
        if (data.success) countries = data.countries;
    } catch (e) {
        console.error('Failed to load countries:', e);
    }
}

function renderPricingCards() {
    const grid = document.getElementById('pricingGrid');
    if (!plans.length) {
        grid.innerHTML = '<p style="color:var(--text-2);text-align:center;grid-column:1/-1;">No plans available.</p>';
        return;
    }

    const savings = { 1: null, 3: '20%', 6: '33%', 12: '42%' };

    grid.innerHTML = plans.map(plan => {
        const isPopular = plan.is_popular;
        const save = savings[plan.duration_months];

        return `
      <div class="pricing-card${isPopular ? ' popular' : ''}">
        ${isPopular ? '<div class="popular-badge">Most Popular</div>' : ''}
        <div class="pricing-header">
          <div class="pricing-name">${plan.badge || ''} ${plan.name}</div>
          <div class="pricing-price">
            <span class="pricing-currency">₹</span>${plan.price.toFixed(0)}
            <span class="pricing-period">/${plan.duration_months}mo</span>
          </div>
          ${save ? `<div style="color:var(--success);font-size:0.85rem;font-weight:600;margin-top:4px;">Save ${save}</div>` : ''}
        </div>
        <p class="pricing-desc">${plan.description}</p>
        <ul class="pricing-features">
          <li><span class="feature-check">✓</span> 1 Premium Number</li>
          <li><span class="feature-check">✓</span> ${plan.duration_months} Month${plan.duration_months > 1 ? 's' : ''} Access</li>
          <li><span class="feature-check">✓</span> Real-time OTP Inbox</li>
          <li><span class="feature-check">✓</span> Number Health Monitoring</li>
          <li><span class="feature-check">✓</span> Instant Replacement</li>
          ${plan.duration_months >= 6 ? '<li><span class="feature-check">✓</span> Priority Support</li>' : ''}
        </ul>
        <button class="btn-primary btn-full" onclick="selectPlan('${plan.id}')">
          <span>Get Started — ₹${plan.price.toFixed(0)}</span>
        </button>
      </div>
    `;
    }).join('');
}

// ===== SELECT PLAN → OPEN PURCHASE MODAL =====
function selectPlan(planId) {
    selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return;
    openPurchaseModal();
}

function openPurchaseModal() {
    if (!selectedPlan) return;

    // Require login first
    if (!authToken) {
        showAuthModal('login');
        showNotif('Please login or create an account first.', 'error');
        return;
    }

    // Build country options
    let countryOptions = countries.map(c =>
        `<option value="${c.country_code}">${c.flag} ${c.country} (${c.available} available)</option>`
    ).join('');
    if (!countryOptions) countryOptions = '<option value="">Loading...</option>';

    document.getElementById('modalTitle').textContent = 'Complete Your Purchase';
    document.getElementById('modalDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">Plan</span><span class="detail-val">${selectedPlan.badge} ${selectedPlan.name}</span></div>
    <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-val">${selectedPlan.duration_months} month${selectedPlan.duration_months > 1 ? 's' : ''}</span></div>
    <div class="detail-row"><span class="detail-label">Account</span><span class="detail-val">${currentUser.email}</span></div>
    <div class="detail-row"><span class="detail-label">Total</span><span class="detail-val" style="color:var(--primary);font-size:1.2rem;">₹${selectedPlan.price.toFixed(0)}</span></div>
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
      <span>Complete Purchase — ₹${selectedPlan.price.toFixed(0)}</span>
    </button>
  `;

    document.getElementById('purchaseModal').classList.add('open');
    document.body.classList.add('modal-open');
}

function closePurchaseModal() {
    document.getElementById('purchaseModal').classList.remove('open');
    document.body.classList.remove('modal-open');
}

async function completePurchase() {
    const countryCode = document.getElementById('purchaseCountry').value;

    if (!countryCode) {
        showNotif('Please select a country.', 'error');
        return;
    }

    const btn = document.getElementById('purchaseBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width:20px;height:20px;margin:0;border-width:2px;"></div> Processing...';

    try {
        const res = await fetch(API_BASE + '/api/purchase', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                plan_id: selectedPlan.id,
                country_code: countryCode
            })
        });
        const data = await res.json();

        if (data.success) {
            document.querySelector('.modal-form').style.display = 'none';
            document.getElementById('modalResult').style.display = 'block';
            document.getElementById('modalResult').innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:4rem;margin-bottom:16px;">🎉</div>
          <h3 style="margin-bottom:12px;color:var(--success);">Purchase Successful!</h3>
          <p style="color:var(--text-2);margin-bottom:4px;">Your assigned number:</p>
          <div style="font-family:var(--font-mono);font-size:1.8rem;font-weight:800;color:var(--primary);margin-bottom:12px;letter-spacing:1px;">${data.purchase.flag} ${data.purchase.number}</div>
          <p style="color:var(--text-3);font-size:0.85rem;margin-bottom:16px;">
            ${data.purchase.country} · ${data.purchase.plan} Plan · Expires: ${new Date(data.purchase.expires_at).toLocaleDateString()}
          </p>
          <div style="background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.2);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left;">
            <p style="color:var(--text-1);font-weight:600;margin-bottom:8px;">🔍 Verify your number before using:</p>
            <p style="color:var(--text-2);font-size:0.85rem;margin-bottom:12px;">Click below to check if this number is already registered on WhatsApp. If it shows a profile, the number is already in use — you can replace it for free.</p>
            <a href="https://wa.me/+${data.purchase.number}" target="_blank" style="display:inline-block;padding:10px 20px;background:rgba(37,211,102,0.15);color:#25d366;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.9rem;border:1px solid rgba(37,211,102,0.3);">
              🔗 Check on WhatsApp
            </a>
          </div>
          <button class="btn-primary btn-full" onclick="closePurchaseModal(); showPage('dashboard');">
            Go to Dashboard →
          </button>
        </div>
      `;
            showNotif('🎉 Number purchased successfully!', 'success');
        } else {
            showNotif(data.error || 'Purchase failed.', 'error');
            btn.disabled = false;
            btn.innerHTML = `<span>Complete Purchase — ₹${selectedPlan.price.toFixed(0)}</span>`;
        }
    } catch (e) {
        showNotif('Network error. Please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = `<span>Complete Purchase — ₹${selectedPlan.price.toFixed(0)}</span>`;
    }
}

// ===== DASHBOARD =====
async function initDashboard() {
    stopInboxRefresh();
    if (!authToken) {
        showAuthModal('login');
        return;
    }
    const content = document.getElementById('activeNumberContent');
    content.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Loading your numbers...</p></div>';

    try {
        const res = await fetch(API_BASE + '/api/purchase/check', { headers: authHeaders() });
        const data = await res.json();

        if (data.success && data.has_active) {
            allPurchases = data.purchases || [data.purchase];
            activePurchase = allPurchases[0];
            renderAllPurchases();
        } else {
            document.getElementById('activeNumberCard').style.display = 'none';
            document.getElementById('otpInboxCard').style.display = 'none';
            document.getElementById('healthCard').style.display = 'none';
            document.getElementById('refundCard').style.display = 'none';
            document.getElementById('noPurchaseState').style.display = 'block';
            document.getElementById('numberStatus').textContent = 'No Active Number';
        }
    } catch (e) {
        content.innerHTML = '<p style="color:var(--danger)">Failed to check purchases.</p>';
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
        <div class="dnd-val">${p.number}</div>
        <div class="dnd-meta">
          <span>${p.flag} ${p.country}</span>
          <span>Plan: ${p.plan_name}</span>
          <span>Expires: ${new Date(p.expires_at).toLocaleDateString()}</span>
        </div>
        <div style="background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.2);border-radius:12px;padding:14px;margin-top:12px;text-align:left;">
          <p style="font-weight:600;color:var(--text-1);margin-bottom:6px;font-size:0.9rem;">\ud83d\udd0d Check if this number is already registered on WhatsApp</p>
          <p style="color:var(--text-3);font-size:0.8rem;margin-bottom:10px;">If it shows a WhatsApp profile, the number is already in use. You can replace it for free.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="https://wa.me/+${p.number}" target="_blank" style="display:inline-block;padding:8px 16px;background:rgba(37,211,102,0.15);color:#25d366;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.85rem;border:1px solid rgba(37,211,102,0.3);">
              \ud83d\udd17 Check on WhatsApp
            </a>
            <button onclick="replaceNumber('${p.id}')" class="btn-ghost-sm" style="color:var(--warning);border-color:var(--warning);">
              \ud83d\udd04 Replace
            </button>
            <button onclick="selectNumberForInbox('${p.id}')" class="btn-ghost-sm">
              \ud83d\udce8 View OTPs
            </button>
          </div>
        </div>
      </div>`;
    }

    html += `
      <div style="text-align:center;margin-top:8px;">
        <button class="btn-primary" onclick="smoothScroll('pricing')">\u2795 Buy Another Number</button>
      </div>`;

    document.getElementById('activeNumberContent').innerHTML = html;

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
        showNotif(`Showing OTPs for ${p.number}`, 'success');
    }
}


// ===== OTP INBOX =====
async function refreshInbox() {
    if (!activePurchase) return;
    try {
        const res = await fetch(API_BASE + '/api/number/' + activePurchase.number_id + '/otps');
        const data = await res.json();
        if (data.success) renderInbox(data.otps);
    } catch (e) { console.error('Inbox fetch error:', e); }
}

function renderInbox(otps) {
    const inbox = document.getElementById('otpInbox');
    if (!otps.length) {
        inbox.innerHTML = '<div class="empty-inbox"><div class="empty-icon">📭</div><p>No OTPs received yet. Use your number for verification and messages will appear here.</p></div>';
        return;
    }
    inbox.innerHTML = otps.map(o => `
    <div class="inbox-msg">
      <div class="inbox-msg-header">
        <span class="inbox-sender">${o.sender || 'Unknown'}</span>
        <span class="inbox-time">${o.received_at ? new Date(o.received_at).toLocaleString() : ''}</span>
      </div>
      ${o.otp_code ? `<div class="inbox-otp" onclick="copyText('${o.otp_code}')" title="Click to copy" style="cursor:pointer;">${o.otp_code}</div>` : ''}
      <div class="inbox-text">${escapeHtmlDisplay(o.message || '')}</div>
    </div>
  `).join('');
}

function startInboxRefresh() { stopInboxRefresh(); inboxTimer = setInterval(refreshInbox, 5000); }
function stopInboxRefresh() { if (inboxTimer) { clearInterval(inboxTimer); inboxTimer = null; } }

// ===== NUMBER HEALTH =====
async function checkHealth() {
    if (!activePurchase) return;
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    dot.className = 'health-dot checking';
    text.textContent = 'Checking number health...';
    try {
        const res = await fetch(API_BASE + '/api/number/' + activePurchase.number_id + '/status');
        const data = await res.json();
        if (data.success) {
            if (data.status.is_active && data.status.is_receiving_sms) {
                dot.className = 'health-dot healthy';
                text.textContent = '✅ Number is active and receiving SMS';
                text.style.color = 'var(--success)';
            } else {
                dot.className = 'health-dot unhealthy';
                text.textContent = '⚠️ Number may not be receiving SMS';
                text.style.color = 'var(--danger)';
            }
        }
    } catch (e) {
        dot.className = 'health-dot unhealthy';
        text.textContent = '❌ Could not check number health';
        text.style.color = 'var(--danger)';
    }
}

// ===== REFUND =====
async function submitRefund() {
    if (!activePurchase) return;
    const reason = document.getElementById('refundReason').value;
    if (!reason) { showNotif('Please select a reason.', 'error'); return; }
    try {
        const res = await fetch(API_BASE + '/api/refund', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ purchase_id: activePurchase.id, reason })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('refundResult').innerHTML = `<p style="color:var(--success);margin-top:12px;">✅ ${data.message}</p>`;
            showNotif('Refund request submitted!', 'success');
        } else {
            showNotif(data.error || 'Request failed.', 'error');
        }
    } catch (e) { showNotif('Network error.', 'error'); }
}

// ===== REPLACE NUMBER =====
async function replaceNumber(purchaseId) {
    try {
        const res = await fetch(API_BASE + '/api/replace-number', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ purchase_id: purchaseId || undefined })
        });
        const data = await res.json();
        if (data.success) {
            showNotif('✅ Number replaced! Buy a new one from the pricing section.', 'success');
            initDashboard(); // Refresh dashboard
        } else {
            showNotif(data.error || 'Replace failed.', 'error');
        }
    } catch (e) {
        showNotif('Network error.', 'error');
    }
}


// ===== ADMIN =====
async function adminLogin() {
    adminKey = document.getElementById('adminKey').value;
    if (!adminKey) return showNotif('Enter admin key.', 'error');
    try {
        const res = await fetch(API_BASE + '/api/admin/dashboard', { headers: { 'X-Admin-Key': adminKey } });
        const data = await res.json();
        if (data.success) {
            document.getElementById('adminAuthCard').style.display = 'none';
            document.getElementById('adminContent').style.display = 'block';
            renderAdminDashboard(data);
            loadAdminRefunds();
            refreshQualityStatus();
            showNotif('Welcome, Admin!', 'success');
        } else { showNotif('Invalid admin key.', 'error'); }
    } catch (e) { showNotif('Connection failed.', 'error'); }
}

function renderAdminDashboard(data) {
    const s = data.stats;
    document.getElementById('adminStats').innerHTML = `
    <div class="admin-stat-card"><div class="admin-stat-label">Total Users</div><div class="admin-stat-val">${s.totalUsers}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Total Revenue</div><div class="admin-stat-val">₹${s.totalRevenue.toFixed(0)}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Active Numbers</div><div class="admin-stat-val">${s.activePurchases}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Available Numbers</div><div class="admin-stat-val">${s.availableNumbers}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Total Purchases</div><div class="admin-stat-val">${s.totalPurchases}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Used Numbers</div><div class="admin-stat-val">${s.usedNumbers}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Pending Refunds</div><div class="admin-stat-val" style="color:var(--warning)">${s.pendingRefunds}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Number Pool</div><div class="admin-stat-val">${s.totalNumbers}</div></div>
  `;
    document.getElementById('numbersAvailable').textContent = s.availableNumbers + ' available';
    renderRevenueChart(data.revenueByMonth);
    renderPurchasesTable(data.recentPurchases);
    loadAdminNumbers();
}

function renderRevenueChart(months) {
    const container = document.getElementById('revenueChart');
    if (!months.length) { container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:20px;">No revenue data yet.</p>'; return; }
    const maxRevenue = Math.max(...months.map(m => m.revenue), 1);
    container.innerHTML = `<div class="chart-bars">${months.map(m => {
        const pct = (m.revenue / maxRevenue) * 100;
        return `<div class="chart-bar-wrap"><div class="chart-val">₹${m.revenue.toFixed(0)}</div><div class="chart-bar" style="height:${Math.max(pct, 5)}%"></div><div class="chart-label">${m.month.split('-')[1]}</div></div>`;
    }).join('')}</div>`;
}

function renderPurchasesTable(purchases) {
    const wrap = document.getElementById('purchasesTable');
    if (!purchases.length) { wrap.innerHTML = '<p style="color:var(--text-3);padding:16px;">No purchases yet.</p>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Number</th><th>Country</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th><th>Check</th></tr></thead><tbody>${purchases.map(p => `<tr><td style="font-family:var(--font-mono);font-weight:600;">${p.number}</td><td>${p.flag} ${p.country}</td><td>${p.plan_name}</td><td style="font-family:var(--font-mono);">₹${p.amount.toFixed(0)}</td><td class="status-${p.status}">${p.status.toUpperCase()}</td><td>${new Date(p.purchased_at).toLocaleDateString()}</td><td><a href="https://wa.me/+${p.number}" target="_blank" style="color:#25d366;font-weight:600;text-decoration:none;" title="Check on WhatsApp">🔍 WA</a></td></tr>`).join('')}</tbody></table>`;
}

async function loadAdminNumbers() {
    try {
        const res = await fetch(API_BASE + '/api/admin/numbers', { headers: { 'X-Admin-Key': adminKey } });
        const data = await res.json();
        if (data.success) {
            // Only show allocated numbers in admin table (not all 29k)
            const allocated = data.numbers.filter(n => n.status === 'allocated');
            const wrap = document.getElementById('numbersTable');
            if (!allocated.length) { wrap.innerHTML = '<p style="color:var(--text-3);padding:16px;">No allocated numbers.</p>'; return; }
            wrap.innerHTML = `<table><thead><tr><th>Number</th><th>Country</th><th>Status</th><th>Allocated To</th><th>Expires</th></tr></thead><tbody>${allocated.map(n => `<tr><td style="font-family:var(--font-mono);font-weight:600;">${n.number}</td><td>${n.flag || ''} ${n.country}</td><td class="status-${n.status}">${n.status.toUpperCase()}</td><td style="font-family:var(--font-mono);font-size:0.75rem;">${n.allocated_to || '—'}</td><td>${n.expires_at ? new Date(n.expires_at).toLocaleDateString() : '—'}</td></tr>`).join('')}</tbody></table>`;
        }
    } catch (e) { console.error(e); }
}

async function loadAdminRefunds() {
    try {
        const res = await fetch(API_BASE + '/api/admin/refunds', { headers: { 'X-Admin-Key': adminKey } });
        const data = await res.json();
        if (data.success) {
            const pending = data.refunds.filter(r => r.status === 'pending');
            document.getElementById('refundsCount').textContent = pending.length;
            const wrap = document.getElementById('refundsTable');
            if (!data.refunds.length) { wrap.innerHTML = '<p style="color:var(--text-3);padding:16px;">No refund requests.</p>'; return; }
            wrap.innerHTML = `<table><thead><tr><th>Number</th><th>Country</th><th>Reason</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.refunds.map(r => `<tr><td style="font-family:var(--font-mono);">${r.number}</td><td>${r.country}</td><td>${r.reason}</td><td style="font-size:0.8rem;">${r.email}</td><td class="status-${r.status}">${r.status.toUpperCase()}</td><td>${r.status === 'pending' ? `<button class="btn-ghost-sm" onclick="resolveRefund('${r.id}','refund')">Refund</button>` : (r.resolution || '—')}</td></tr>`).join('')}</tbody></table>`;
        }
    } catch (e) { console.error(e); }
}

async function resolveRefund(id, action) {
    try {
        const res = await fetch(API_BASE + '/api/admin/refund/' + id + '/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
            body: JSON.stringify({ action, resolution: 'Approved by admin' })
        });
        const data = await res.json();
        if (data.success) { showNotif('Refund resolved!', 'success'); loadAdminRefunds(); adminLogin(); }
        else { showNotif(data.error || 'Failed.', 'error'); }
    } catch (e) { showNotif('Error resolving refund.', 'error'); }
}

// ===== NUMBER QUALITY ADMIN =====
async function refreshQualityStatus() {
    if (!adminKey) return;
    try {
        const res = await fetch(API_BASE + '/api/admin/quality', {
            headers: { 'X-Admin-Key': adminKey }
        });
        const data = await res.json();
        if (data.success) updateQualityUI(data);
    } catch (e) { console.error(e); }
}

function updateQualityUI(data) {
    const badge = document.getElementById('qualitySyncBadge');
    if (!badge) return;

    // Update counts from db_quality array
    let verified = 0, likely = 0, unknown = 0;
    if (data.db_quality) {
        for (const q of data.db_quality) {
            if (q.quality === 'verified') verified = q.count;
            else if (q.quality === 'likely') likely = q.count;
            else unknown += q.count;
        }
    }

    document.getElementById('qVerified').textContent = verified.toLocaleString();
    document.getElementById('qLikely').textContent = likely.toLocaleString();
    document.getElementById('qUnknown').textContent = unknown.toLocaleString();

    if (data.last_sync) {
        const age = data.sync_age_minutes;
        badge.textContent = `Synced ${age}m ago`;
        badge.style.color = age < 15 ? 'var(--success)' : 'var(--warning)';
        document.getElementById('qualityLastSync').textContent =
            `Last: ${new Date(data.last_sync).toLocaleTimeString()} · ${data.total_otps} OTPs analyzed`;
    } else {
        badge.textContent = 'Not synced';
        badge.style.color = 'var(--text-3)';
    }
}

async function syncQuality() {
    if (!adminKey) return showNotif('Login as admin first.', 'error');
    const badge = document.getElementById('qualitySyncBadge');
    badge.textContent = 'Syncing...';
    try {
        const res = await fetch(API_BASE + '/api/admin/quality/sync', {
            method: 'POST',
            headers: { 'X-Admin-Key': adminKey }
        });
        const data = await res.json();
        if (data.success) {
            showNotif(`✅ Synced! ${data.verified} verified, ${data.likely} likely working`, 'success');
            refreshQualityStatus();
        } else showNotif(data.error || 'Sync failed.', 'error');
    } catch (e) { showNotif('Network error.', 'error'); }
}

async function checkNumberQuality() {
    if (!adminKey) return showNotif('Login as admin first.', 'error');
    const num = document.getElementById('qualityCheckNumber').value.trim();
    if (!num) return showNotif('Enter a number.', 'error');
    const resultDiv = document.getElementById('qualityCheckResult');
    resultDiv.innerHTML = '<span style="color:var(--text-3);">Checking...</span>';
    try {
        const res = await fetch(API_BASE + '/api/admin/quality/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
            body: JSON.stringify({ number: num })
        });
        const data = await res.json();
        if (data.success) {
            const labels = {
                'verified': '<span style="color:var(--success);">✅ VERIFIED — This number has received WhatsApp OTPs (best quality)</span>',
                'likely': '<span style="color:var(--warning);">📨 LIKELY — This number has received OTPs from other services (probably works)</span>',
                'unknown': '<span style="color:var(--text-3);">❓ UNKNOWN — No OTP history found for this number</span>'
            };
            resultDiv.innerHTML = labels[data.quality] || `<span>${data.quality}</span>`;
        } else {
            resultDiv.innerHTML = '<span style="color:var(--danger);">Failed to check.</span>';
        }
    } catch (e) { resultDiv.innerHTML = '<span style="color:var(--danger);">Network error.</span>'; }
}

// ===== UTILS =====
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showNotif('✅ Copied to clipboard!', 'success')).catch(() => {
        const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
        document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
        showNotif('✅ Copied!', 'success');
    });
}

function escapeHtmlDisplay(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

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
    checkHash();
    await Promise.all([loadPlans(), loadCountries()]);
}
init();
