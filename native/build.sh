#!/usr/bin/env bash
# Build the native packer without cmake. Requires: g++/clang++, python3, pybind11.
#   pip install pybind11
#   ./native/build.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! python3 -c "import pybind11" 2>/dev/null; then
  echo "pybind11 not found. Install it with: pip install pybind11" >&2
  exit 1
fi

SUFFIX="$(python3-config --extension-suffix)"
echo "Building palletizer_native${SUFFIX} ..."
c++ -O3 -Wall -shared -std=c++17 -fPIC \
    $(python3 -m pybind11 --includes) \
    palletizer_native.cpp \
    -o "palletizer_native${SUFFIX}"
echo "Done. Verify with: python3 -c 'import native.accelerator as a; print(a.available())'"
