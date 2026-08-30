#!/usr/bin/env bash
# index.html = shell_head + _demo_structured.html + shell_tail（單一真相=_demo_structured.html）
# 用法: build/build.sh        重建 index.html
#       build/build.sh --check 只驗證 index.html 與元件同步（CI 用,防「改了 _demo 忘了重建」）
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--check" ]; then
  cat build/shell_head.html _demo_structured.html build/shell_tail.html | diff -q - index.html \
    || { echo "✗ index.html 未與 _demo_structured.html 同步,請跑 build/build.sh 後重新 commit"; exit 1; }
  echo "✓ index.html 同步"
else
  cat build/shell_head.html _demo_structured.html build/shell_tail.html > index.html
  echo "✓ index.html 已重建"
fi
