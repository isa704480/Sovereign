# SOVEREIGN CLI installer - Windows (PowerShell)
#   irm https://soveregn.xyz/install.ps1 | iex
# CMD:  powershell -c "irm https://soveregn.xyz/install.ps1 | iex"
#
# Node.js 20+ bo'lsa - npm orqali (@islombekrrr/sov-cli).
# Bo'lmasa - tayyor sov.exe (GitHub Releases) %LOCALAPPDATA%\Programs\sov ga,
# SHA256 tekshiruvi bilan, va FOYDALANUVCHI PATH'iga qo'shiladi. Admin kerak emas.
#
# Sozlash (ixtiyoriy):
#   $env:SOV_INSTALL = 'binary'        Node bo'lsa ham binary   (yoki 'npm')
#   $env:SOV_VERSION = 'cli-v0.10.0'   aniq reliz (standart: eng so'nggi cli-v*)
#   $env:SOV_NO_MODIFY_PATH = '1'      PATH'ni o'zgartirmaslik
#   $env:SOV_DOWNLOAD_BASE = 'https://...'  binary manzili (mirror/test; <base>/sov-win-x64.exe)
# `iex` ichida `exit` oynani yopib yuboradi - shuning uchun hamma joyda `return`.

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $pkg = '@islombekrrr/sov-cli'
  $repo = 'isa704480/Sovereign'
  $mode = if ($env:SOV_INSTALL) { $env:SOV_INSTALL } else { 'auto' }

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  function Test-NodeOk {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { return $false }
    try {
      $major = [int](node -p "process.versions.node.split('.')[0]")
      return ($major -ge 20)
    } catch { return $false }
  }

  # npm.cmd - npm.ps1 EMAS: standart ExecutionPolicy (Restricted) .ps1 skriptlarni bloklaydi,
  # `npm` esa PowerShell'da avval npm.ps1 ga yechiladi.
  function Get-NpmExe {
    $cmd = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return 'npm'
  }

  function Install-Npm {
    Write-Host "Installing $pkg via npm ..."
    # Windows'da npm global papkasi %APPDATA%\npm - admin kerak emas.
    # Chiqishni Out-Host'ga: aks holda u funksiya natijasiga qo'shilib, xato ham "true" bo'lib ko'rinadi.
    # $global:LASTEXITCODE oldindan 0 ga emas, -1 ga: npm umuman ishga tushmasa (bloklangan
    # skript) avvalgi `node -p` ning 0 kodi "muvaffaqiyat" bo'lib qolmasin.
    $global:LASTEXITCODE = -1
    try {
      & (Get-NpmExe) install -g $pkg | Out-Host
    } catch {
      Write-Host "npm could not run: $($_.Exception.Message)" -ForegroundColor Yellow
      return $false
    }
    return ($global:LASTEXITCODE -eq 0)
  }

  # O'rnatilgan `sov` haqiqatan ishga tushadimi (`sov --version`)? Versiya qatori yoki $null.
  function Get-SovVersion([string[]]$candidates) {
    foreach ($p in $candidates) {
      if (-not $p -or -not (Test-Path -LiteralPath $p)) { continue }
      try {
        $global:LASTEXITCODE = -1
        # Butun chiqish yig'iladi (Select -First pipeline'ni erta to'xtatib, exit kodini yo'qotmasin).
        $out = @(& $p --version)
        $first = if ($out.Count) { "$($out[0])".Trim() } else { '' }
        if ($global:LASTEXITCODE -eq 0 -and $first) { return $first }
      } catch { }
    }
    return $null
  }

  function Get-NpmSovCandidates {
    $list = @()
    $onPath = Get-Command sov.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { $list += $onPath.Source }
    try {
      $prefixOut = @(& (Get-NpmExe) prefix -g)
      $prefix = if ($prefixOut.Count) { "$($prefixOut[0])".Trim() } else { '' }
      if ($prefix) { $list += (Join-Path $prefix 'sov.cmd') }
    } catch { }
    if ($env:APPDATA) { $list += (Join-Path $env:APPDATA 'npm\sov.cmd') }
    return $list
  }

  function Get-ReleaseBase {
    if ($env:SOV_DOWNLOAD_BASE) { return $env:SOV_DOWNLOAD_BASE.TrimEnd('/') }
    if ($env:SOV_VERSION) { return "https://github.com/$repo/releases/download/$($env:SOV_VERSION)" }
    try {
      $rels = Invoke-RestMethod -UseBasicParsing -Headers @{ 'User-Agent' = 'sov-installer'; 'Accept' = 'application/vnd.github+json' } -Uri "https://api.github.com/repos/$repo/releases?per_page=30"
      $cli = $rels | Where-Object { $_.tag_name -like 'cli-v*' -and -not $_.draft } | Select-Object -First 1
      if ($cli) { return "https://github.com/$repo/releases/download/$($cli.tag_name)" }
    } catch { }
    return "https://github.com/$repo/releases/latest/download"
  }

  # Foydalanuvchi (HKCU) PATH - REG_EXPAND_SZ turini va %VAR% larni saqlagan holda.
  function Add-UserPath([string]$dir) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    try {
      $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $parts = @($raw -split ';' | Where-Object { $_ })
      $expanded = $parts | ForEach-Object { [Environment]::ExpandEnvironmentVariables($_).TrimEnd('\') }
      if ($expanded -contains $dir.TrimEnd('\')) { return $false }
      $new = (@($parts) + $dir) -join ';'
      $key.SetValue('Path', $new, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    } finally {
      $key.Close()
    }
    # Ochiq oynalar/Explorer yangi PATH'ni bilishi uchun WM_SETTINGCHANGE (ikki marta set qilish usuli).
    [Environment]::SetEnvironmentVariable('SOV_INSTALL_REFRESH', '1', 'User')
    [Environment]::SetEnvironmentVariable('SOV_INSTALL_REFRESH', $null, 'User')
    return $true
  }

  function Install-Binary {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -eq 'ARM64') {
      Write-Host 'Windows ARM64: installing the x64 build (runs under emulation).' -ForegroundColor Yellow
    } elseif ($arch -ne 'AMD64') {
      Write-Host "Unsupported CPU ($arch). Install Node.js 20+ from https://nodejs.org and run: npm install -g $pkg" -ForegroundColor Red
      return $false
    }
    $name = 'sov-win-x64.exe'
    $base = Get-ReleaseBase
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("sov-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
      Write-Host "Downloading $name ..."
      $exe = Join-Path $tmp $name
      $sumFile = "$exe.sha256"
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $exe
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$name.sha256" -OutFile $sumFile
      } catch {
        Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
      }
      $expected = ((Get-Content -Raw $sumFile).Trim() -split '\s+')[0].ToLower()
      $actual = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash.ToLower()
      if (-not $expected -or $expected -ne $actual) {
        Write-Host "SHA256 mismatch (expected $expected, got $actual) - not installed." -ForegroundColor Red
        return $false
      }
      Write-Host "Checksum OK ($actual)"

      $dir = Join-Path $env:LOCALAPPDATA 'Programs\sov'
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      $target = Join-Path $dir 'sov.exe'
      try {
        Move-Item -Force -Path $exe -Destination $target
      } catch {
        Write-Host "Could not replace $target (is sov running? close it and retry): $($_.Exception.Message)" -ForegroundColor Red
        return $false
      }
      # `sovereign` - oddiy (tasdiqli) rejim; `sov` - vibe rejim (npm bilan bir xil).
      Set-Content -Path (Join-Path $dir 'sovereign.cmd') -Value '@"%~dp0sov.exe" --no-vibe %*' -Encoding Ascii
      Write-Host "Installed: $target"

      $onPath = ($env:Path -split ';' | ForEach-Object { $_.TrimEnd('\') }) -contains $dir.TrimEnd('\')
      if (-not $onPath) {
        if ($env:SOV_NO_MODIFY_PATH) {
          Write-Host "NOTE: $dir is not on your PATH. Add it to your user PATH to run 'sov'." -ForegroundColor Yellow
        } else {
          if (Add-UserPath $dir) { Write-Host "Added $dir to your user PATH (no admin needed)." }
          $env:Path = "$env:Path;$dir"
          Write-Host 'Open a new terminal window if `sov` is not found.' -ForegroundColor Yellow
        }
      }
      return $target
    } finally {
      Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
    }
  }

  # "Done!" faqat `sov --version` haqiqatan ishlaganda chiqadi.
  $version = $null
  $viaNpm = $false
  if ($mode -ne 'binary' -and (Test-NodeOk)) {
    if (Install-Npm) {
      $version = Get-SovVersion (Get-NpmSovCandidates)
      if (-not $version) {
        Write-Host ''
        Write-Host "npm reported success, but 'sov --version' did not run." -ForegroundColor Red
        Write-Host 'Open a NEW terminal and try:  sov.cmd --version' -ForegroundColor Yellow
        Write-Host "Or install the standalone binary instead:  `$env:SOV_INSTALL='binary'; irm https://soveregn.xyz/install.ps1 | iex" -ForegroundColor Yellow
        return
      }
      $viaNpm = $true
    } else {
      Write-Host 'npm install failed - falling back to the standalone binary.' -ForegroundColor Yellow
    }
  } elseif ($mode -eq 'npm') {
    Write-Host 'SOV_INSTALL=npm needs Node.js 20+ with npm (https://nodejs.org).' -ForegroundColor Red
    return
  } elseif ($mode -ne 'binary') {
    Write-Host 'Node.js 20+ not found - installing the standalone binary (no Node needed).'
  }

  if (-not $version) {
    $bin = Install-Binary | Select-Object -Last 1
    if (-not $bin) { return }
    $version = Get-SovVersion @([string]$bin)
    if (-not $version) {
      Write-Host "Installed $bin, but 'sov --version' did not run on this system - not finished." -ForegroundColor Red
      return
    }
  }

  Write-Host ''
  Write-Host "Done! $version - start it with:  sov      (check setup: sov doctor)" -ForegroundColor Green
  if ($viaNpm) {
    # npm `sov` uchun sov.ps1 ham yaratadi - standart siyosatda PowerShell uni bloklaydi.
    $policy = ''
    try { $policy = [string](Get-ExecutionPolicy) } catch { }
    if ($policy -in @('Restricted', 'AllSigned', 'Undefined')) {
      Write-Host "PowerShell blocks .ps1 scripts here (ExecutionPolicy $policy): run it as  sov.cmd,  or allow scripts once:" -ForegroundColor Yellow
      Write-Host '  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned' -ForegroundColor Yellow
    }
  }
}
