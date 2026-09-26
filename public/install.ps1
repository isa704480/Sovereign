# SOVEREIGN CLI installer — Windows (PowerShell)
#   irm https://soveregn.xyz/install.ps1 | iex
# CMD:  powershell -c "irm https://soveregn.xyz/install.ps1 | iex"
# `iex` ichida `exit` oynani yopib yuboradi — shuning uchun `return`.

$pkg = '@islombekrrr/sov-cli'

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'SOVEREIGN CLI needs Node.js 20+ (with npm). Install it from https://nodejs.org and run this again.' -ForegroundColor Yellow
  return
}

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Host "Found Node.js $(node -v) - SOVEREIGN CLI needs 20+. Update from https://nodejs.org" -ForegroundColor Yellow
  return
}

Write-Host "Installing $pkg ..."
npm install -g $pkg
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Install failed. Try again in a terminal opened as Administrator.' -ForegroundColor Red
  return
}

Write-Host ''
Write-Host 'Done! Start it with:  sov' -ForegroundColor Green
