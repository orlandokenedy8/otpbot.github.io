# ============================================
# OTPBot — Automated Deployment Script
# Deploys Frontend to GitHub Pages
# Deploys Backend to Koyeb
# ============================================

param(
    [string]$KoyebApiUrl = ""
)

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  OTPBot Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# --- STEP 1: Build minified files ---
Write-Host "[1/5] Building production files..." -ForegroundColor Yellow
node build.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Build complete!" -ForegroundColor Green

# --- STEP 2: Update API URL if provided ---
if ($KoyebApiUrl -ne "") {
    Write-Host "[2/5] Updating API URL to: $KoyebApiUrl" -ForegroundColor Yellow
    $appFile = "public/js/app.js"
    $content = Get-Content $appFile -Raw
    $content = $content -replace "https://otpbot-api\.koyeb\.app", $KoyebApiUrl
    Set-Content $appFile $content
    # Rebuild with new URL
    node build.js
    Write-Host "  API URL updated and rebuilt!" -ForegroundColor Green
} else {
    Write-Host "[2/5] No Koyeb URL provided, skipping API URL update." -ForegroundColor DarkYellow
    Write-Host "  TIP: Run with -KoyebApiUrl 'https://your-app.koyeb.app' to set it" -ForegroundColor DarkYellow
}

# --- STEP 3: Git add & commit ---
Write-Host "[3/5] Committing changes..." -ForegroundColor Yellow
git add -A
$hasChanges = git status --porcelain
if ($hasChanges) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "Deploy OTPBot - $timestamp"
    Write-Host "  Changes committed!" -ForegroundColor Green
} else {
    Write-Host "  No changes to commit." -ForegroundColor DarkYellow
}

# --- STEP 4: Push to GitHub ---
Write-Host "[4/5] Pushing to GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Git push failed! Check your remote." -ForegroundColor Red
    exit 1
}
Write-Host "  Pushed to GitHub!" -ForegroundColor Green

# --- STEP 5: Summary ---
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend (GitHub Pages):" -ForegroundColor Cyan
Write-Host "  https://orlandokenedy8.github.io/otpbot.github.io/" -ForegroundColor White
Write-Host ""
Write-Host "GitHub Actions will auto-deploy in ~1-2 minutes." -ForegroundColor DarkYellow
Write-Host "Check status: https://github.com/orlandokenedy8/otpbot.github.io/actions" -ForegroundColor DarkYellow
Write-Host ""

if ($KoyebApiUrl -eq "") {
    Write-Host "NEXT STEP - Deploy the Backend to Koyeb:" -ForegroundColor Yellow
    Write-Host "===========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Go to https://app.koyeb.com" -ForegroundColor White
    Write-Host "  2. Create App > Web Service > GitHub" -ForegroundColor White
    Write-Host "  3. Select repo: orlandokenedy8/otpbot.github.io" -ForegroundColor White
    Write-Host "  4. Set:" -ForegroundColor White
    Write-Host "     - Name: otpbot-api" -ForegroundColor White
    Write-Host "     - Build command: npm install" -ForegroundColor White
    Write-Host "     - Run command: node server.js" -ForegroundColor White
    Write-Host "     - Port: 3000" -ForegroundColor White
    Write-Host "     - Instance: Free" -ForegroundColor White
    Write-Host "  5. Deploy!" -ForegroundColor White
    Write-Host ""
    Write-Host "  6. After deploy, copy the URL and run:" -ForegroundColor White
    Write-Host "     .\deploy.ps1 -KoyebApiUrl 'https://YOUR-APP.koyeb.app'" -ForegroundColor Cyan
    Write-Host ""
}
