#!/bin/bash
# Build script for vais-server
# Uses vaisc to emit IR, then compiles and links with the C runtime

set -e

VAISC="${VAISC:-${HOME}/.cargo/bin/vaisc}"
SRC_DIR="$(dirname "$0")/src"
ROOT_DIR="$(dirname "$0")"
STD_PATH="${VAIS_STD_PATH:-/Users/sswoo/study/projects/vais/compiler/std}"
DEP_PATH="${VAIS_DEP_PATHS:-${SRC_DIR}}"

echo "=== vais-server build ==="

# Step 1: Clean cache
rm -rf "${SRC_DIR}/.vais-cache/" "${ROOT_DIR}/vais-server.ll"

# Step 2: Emit IR
echo "[1/3] Generating LLVM IR..."
VAIS_SINGLE_MODULE=1 \
VAIS_DEP_PATHS="${DEP_PATH}" \
VAIS_STD_PATH="${STD_PATH}" \
"${VAISC}" build --emit-ir src/main.vais -o "${ROOT_DIR}/vais-server.ll"

# Step 3: Compile IR and runtime
echo "[2/3] Compiling..."
clang -x ir -c "${ROOT_DIR}/vais-server.ll" -o "${ROOT_DIR}/main.o" 2>/dev/null
clang -c "${ROOT_DIR}/runtime.c" -o "${ROOT_DIR}/runtime.o"

# Step 4: Link
echo "[3/3] Linking..."
clang "${ROOT_DIR}/main.o" "${ROOT_DIR}/runtime.o" -o "${ROOT_DIR}/vais-server" -lSystem 2>/dev/null

# Cleanup
rm -f "${ROOT_DIR}/main.o" "${ROOT_DIR}/runtime.o" "${ROOT_DIR}/vais-server.ll"

echo "=== Build successful: vais-server ==="
ls -la "${ROOT_DIR}/vais-server"
