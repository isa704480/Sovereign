#!/usr/bin/env sh
# SOVEREIGN CLI installer — macOS / Linux
#   curl -fsSL https://soveregn.xyz/install.sh | sh
#
# Node.js 20+ bo'lsa — npm orqali (@islombekrrr/sov-cli).
# Bo'lmasa — tayyor binary (GitHub Releases) ~/.local/bin ga, SHA256 tekshiruvi bilan.
# Hech qachon sudo/admin talab qilmaydi.
#
# Sozlash (ixtiyoriy):
#   SOV_INSTALL=binary        Node bo'lsa ham binary o'rnatish   (yoki SOV_INSTALL=npm)
#   SOV_INSTALL_DIR=~/bin     binary papkasi (standart: ~/.local/bin)
#   SOV_VERSION=cli-v0.10.0   aniq reliz (standart: eng so'nggi cli-v* reliz)
#   SOV_NO_MODIFY_PATH=1      shell profiliga PATH qo'shmaslik
#   SOV_DOWNLOAD_BASE=https://...  binary manzili (mirror/test; <base>/sov-linux-x64 ...)
set -eu

PKG="@islombekrrr/sov-cli"
REPO="isa704480/Sovereign"
MODE="${SOV_INSTALL:-auto}"
BIN_DIR="${SOV_INSTALL_DIR:-$HOME/.local/bin}"

has() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$*"; }
err() { printf 'sov install: %s\n' "$*" >&2; }

TMP_DIR=""
cleanup() { if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT
trap 'exit 130' INT TERM

node_ok() {
  has node && has npm || return 1
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$major" -ge 20 ] 2>/dev/null
}

# Foydalanuvchi PATH'iga qo'shish (faqat uning shell profili; tizim fayllari emas).
ensure_path() {
  dir="$1"
  case ":$PATH:" in *":$dir:"*) return 0 ;; esac
  if [ -n "${SOV_NO_MODIFY_PATH:-}" ]; then
    say "NOTE: $dir is not on your PATH. Add it:  export PATH=\"$dir:\$PATH\""
    return 0
  fi
  shell_name=$(basename "${SHELL:-sh}")
  case "$shell_name" in
    zsh) rc="$HOME/.zshrc"; line="export PATH=\"$dir:\$PATH\"" ;;
    bash)
      if [ "$(uname -s)" = Darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
      line="export PATH=\"$dir:\$PATH\""
      ;;
    fish) rc="$HOME/.config/fish/config.fish"; line="fish_add_path \"$dir\"" ;;
    *) rc="$HOME/.profile"; line="export PATH=\"$dir:\$PATH\"" ;;
  esac
  if [ -f "$rc" ] && grep -F "$dir" "$rc" >/dev/null 2>&1; then
    :
  else
    mkdir -p "$(dirname "$rc")"
    printf '\n# SOVEREIGN CLI\n%s\n' "$line" >>"$rc"
    say "Added $dir to PATH in $rc"
  fi
  say "Open a new terminal (or run:  export PATH=\"$dir:\$PATH\") to use 'sov'."
}

install_npm() {
  say "Installing $PKG via npm ..."
  if npm install -g "$PKG"; then return 0; fi
  # Global papka root'ga tegishli bo'lsa — sudo EMAS, foydalanuvchi prefiksi.
  prefix="$HOME/.local"
  say "Global npm folder is not writable — installing into $prefix instead (no sudo) ..."
  npm install -g --prefix "$prefix" "$PKG" || return 1
  ensure_path "$prefix/bin"
}

detect_target() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Linux) os=linux ;;
    Darwin) os=macos ;;
    *) err "unsupported OS: $os (install Node.js 20+ and run: npm install -g $PKG)"; return 1 ;;
  esac
  case "$arch" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) err "unsupported CPU: $arch (install Node.js 20+ and run: npm install -g $PKG)"; return 1 ;;
  esac
  # Rosetta ostidagi shell arm64 Mac'ni x86_64 deb ko'rsatadi.
  if [ "$os" = macos ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    arch=arm64
  fi
  if [ "$os" = linux ] && [ "$arch" = arm64 ]; then
    err "no prebuilt linux-arm64 binary yet — install Node.js 20+ and run this again"
    return 1
  fi
  echo "sov-$os-$arch"
}

download() {
  if has curl; then
    curl -fsSL --retry 2 -o "$2" "$1"
  elif has wget; then
    wget -q -O "$2" "$1"
  else
    err "curl or wget is required"
    return 1
  fi
}

sha256_of() {
  if has sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  elif has shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif has openssl; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    return 1
  fi
}

# Eng so'nggi CLI relizi (cli-v*) — repo'da boshqa relizlar ham bo'lishi mumkin.
release_base() {
  if [ -n "${SOV_DOWNLOAD_BASE:-}" ]; then
    echo "${SOV_DOWNLOAD_BASE%/}"
    return 0
  fi
  if [ -n "${SOV_VERSION:-}" ]; then
    echo "https://github.com/$REPO/releases/download/$SOV_VERSION"
    return 0
  fi
  api="https://api.github.com/repos/$REPO/releases?per_page=30"
  json=""
  if has curl; then
    json=$(curl -fsSL -H "Accept: application/vnd.github+json" "$api" 2>/dev/null || true)
  elif has wget; then
    json=$(wget -q -O - "$api" 2>/dev/null || true)
  fi
  tag=$(printf '%s' "$json" | grep -o '"tag_name": *"cli-v[^"]*"' | head -n 1 | sed 's/.*"\(cli-v[^"]*\)"$/\1/')
  if [ -n "$tag" ]; then
    echo "https://github.com/$REPO/releases/download/$tag"
  else
    echo "https://github.com/$REPO/releases/latest/download"
  fi
}

install_binary() {
  name=$(detect_target) || return 1
  base=$(release_base)
  TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t sov)
  say "Downloading $name ..."
  download "$base/$name" "$TMP_DIR/$name" || { err "download failed: $base/$name"; return 1; }
  download "$base/$name.sha256" "$TMP_DIR/$name.sha256" || { err "checksum file missing: $base/$name.sha256"; return 1; }

  expected=$(awk '{print $1}' "$TMP_DIR/$name.sha256" | tr 'A-F' 'a-f')
  actual=$(sha256_of "$TMP_DIR/$name") || { err "no sha256 tool (sha256sum/shasum/openssl) — refusing to install an unverified binary"; return 1; }
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    err "SHA256 mismatch for $name (expected $expected, got $actual) — not installed"
    return 1
  fi
  say "Checksum OK ($actual)"

  mkdir -p "$BIN_DIR"
  chmod 755 "$TMP_DIR/$name"
  mv -f "$TMP_DIR/$name" "$BIN_DIR/sov"
  # `sovereign` — oddiy (tasdiqli) rejim, `sov` — vibe rejim (npm bilan bir xil).
  ln -sf "$BIN_DIR/sov" "$BIN_DIR/sovereign" 2>/dev/null || true
  say "Installed: $BIN_DIR/sov"
  ensure_path "$BIN_DIR"
}

# `sov --version` haqiqatan ishlaydimi? Birinchi ishlagan nomzodning versiya qatorini
# chiqaradi; hech biri ishlamasa — 1. "Done!" faqat shundan keyin.
sov_version() {
  for p in "$@"; do
    [ -n "$p" ] && [ -f "$p" ] && [ -x "$p" ] || continue
    out=$("$p" --version 2>/dev/null) || continue
    first=$(printf '%s\n' "$out" | head -n 1)
    if [ -n "$first" ]; then
      printf '%s\n' "$first"
      return 0
    fi
  done
  return 1
}

if [ "$MODE" != binary ] && node_ok; then
  if install_npm; then
    if ver=$(sov_version "$(command -v sov 2>/dev/null || true)" "$(npm prefix -g 2>/dev/null || true)/bin/sov" "$HOME/.local/bin/sov"); then
      say ""
      say "Done! $ver — start it with:  sov      (check setup: sov doctor)"
      exit 0
    fi
    err "npm reported success, but 'sov --version' did not run. Open a new terminal and try: sov --version  (or reinstall with SOV_INSTALL=binary)"
    exit 1
  fi
  err "npm install failed — falling back to the standalone binary"
elif [ "$MODE" = npm ]; then
  err "SOV_INSTALL=npm needs Node.js 20+ with npm (https://nodejs.org)"
  exit 1
elif [ "$MODE" != binary ]; then
  say "Node.js 20+ not found — installing the standalone binary (no Node needed)."
fi

install_binary || exit 1
if ! ver=$(sov_version "$BIN_DIR/sov"); then
  err "installed $BIN_DIR/sov, but 'sov --version' did not run on this system — not finished"
  exit 1
fi
say ""
say "Done! $ver — start it with:  sov      (check setup: sov doctor)"
