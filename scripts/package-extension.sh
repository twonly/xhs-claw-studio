#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/package"
MANIFEST_PATH="$ROOT_DIR/manifest.json"

if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js 才能读取 manifest 版本号。"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "需要系统提供 zip 命令。"
  exit 1
fi

VERSION="$(node -p "require('$MANIFEST_PATH').version")"
PACKAGE_NAME="xhs-claw-studio-v${VERSION}"
ZIP_PATH="$DIST_DIR/${PACKAGE_NAME}.zip"
GUIDE_SRC="$ROOT_DIR/docs/friend-trial-guide.md"
GUIDE_DST="$DIST_DIR/试用说明.md"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

copy_path() {
  local src="$1"
  local dst="$STAGE_DIR/$1"
  mkdir -p "$(dirname "$dst")"
  cp -R "$ROOT_DIR/$src" "$dst"
}

copy_path manifest.json
copy_path background
copy_path popup
copy_path analysis
copy_path content
copy_path lib
copy_path icons

if [ -f "$GUIDE_SRC" ]; then
  cp "$GUIDE_SRC" "$GUIDE_DST"
fi

rm -f "$ZIP_PATH"
(
  cd "$STAGE_DIR"
  zip -qr "$ZIP_PATH" .
)

rm -rf "$STAGE_DIR"

echo "打包完成："
echo "ZIP: $ZIP_PATH"
if [ -f "$GUIDE_DST" ]; then
  echo "说明: $GUIDE_DST"
fi
echo "提示：ZIP 不包含你浏览器 chrome.storage.local 里的本地数据和 API Key。"
echo "提示：Chrome 开发者模式安装时，仍需先解压 ZIP，再选择包含 manifest.json 的文件夹。"
