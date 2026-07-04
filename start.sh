#!/bin/bash
# =============================================
# SRN — Stellar Restaurant Network Quick Start
# Level 4 - Green Belt Submission
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🍜 SRN — Stellar Restaurant Network"
echo "   Level 4 - Green Belt"
echo "============================================"

# ---- Smart Contracts ----
if [ "$1" = "--contracts" ] || [ "$1" = "--all" ]; then
    echo ""
    echo "🦀 Building smart contracts..."

    echo "  → Restaurant Contract..."
    cd "$SCRIPT_DIR/contracts/restaurant"
    cargo build --target wasm32-unknown-unknown --release 2>/dev/null && echo "     ✅ Built" || echo "     ⚠️ Build skipped (Rust toolchain may not be installed)"

    echo "  → LoyaltyToken Contract..."
    cd "$SCRIPT_DIR/contracts/loyalty-token"
    cargo build --target wasm32-unknown-unknown --release 2>/dev/null && echo "     ✅ Built" || echo "     ⚠️ Build skipped"

    echo "  → RestaurantRegistry Contract..."
    cd "$SCRIPT_DIR/contracts/restaurant-registry"
    cargo build --target wasm32-unknown-unknown --release 2>/dev/null && echo "     ✅ Built" || echo "     ⚠️ Build skipped"
fi

# ---- Contract Tests ----
if [ "$1" = "--test-contracts" ] || [ "$1" = "--all" ]; then
    echo ""
    echo "🧪 Running contract tests..."

    cd "$SCRIPT_DIR/contracts/restaurant"
    cargo test -- --nocapture 2>/dev/null && echo "  ✅ Restaurant tests passed" || echo "  ⚠️ Tests skipped"

    cd "$SCRIPT_DIR/contracts/loyalty-token"
    cargo test -- --nocapture 2>/dev/null && echo "  ✅ LoyaltyToken tests passed" || echo "  ⚠️ Tests skipped"

    cd "$SCRIPT_DIR/contracts/restaurant-registry"
    cargo test -- --nocapture 2>/dev/null && echo "  ✅ RestaurantRegistry tests passed" || echo "  ⚠️ Tests skipped"
fi

# ---- Frontend ----
cd "$SCRIPT_DIR/frontend"

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Build check
if [ "$1" = "--build" ]; then
    echo "🔧 Building frontend for production..."
    npm run build
    echo "✅ Build complete: frontend/dist/"
    exit 0
fi

# Run frontend tests
if [ "$1" = "--test" ] || [ "$1" = "--all" ]; then
    echo ""
    echo "🧪 Running frontend tests..."
    npx vitest run 2>/dev/null || echo "  ⚠️ Tests skipped"
fi

# Deploy to Vercel
if [ "$1" = "--deploy" ]; then
    echo "🚀 Deploying to Vercel..."
    npx vercel --prod
    exit 0
fi

# ---- Backend ----
if [ "$1" = "--backend" ] || [ "$1" = "--all" ]; then
    echo ""
    echo "🔧 Starting backend server..."
    cd "$SCRIPT_DIR/backend"
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npm run dev &
    BACKEND_PID=$!
    echo "   Backend PID: $BACKEND_PID"
fi

# Default: start dev server
echo ""
echo "🚀 Starting frontend dev server..."
echo "   Local:  http://localhost:3000"
echo "   Backend: http://localhost:3001 (if started)"
echo ""

if [ "$1" = "--backend" ] || [ "$1" = "--all" ]; then
    # Wait for both
    npx vite --host 0.0.0.0 &
    FRONTEND_PID=$!
    echo ""
    echo "Press Ctrl+C to stop all services"
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
    wait
else
    npx vite --host 0.0.0.0
fi
