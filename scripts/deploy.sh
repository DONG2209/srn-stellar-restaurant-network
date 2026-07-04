#!/bin/bash
# =============================================
# SRN — Contract Deployment Script
# Deploys all 3 contracts to Stellar Testnet
# =============================================

set -e

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

if [ "$NETWORK" = "testnet" ]; then
    RPC="https://soroban-testnet.stellar.org"
    PASSPHRASE="Test SDF Network ; September 2015"
elif [ "$NETWORK" = "mainnet" ]; then
    RPC="https://soroban-mainnet.stellar.org"
    PASSPHRASE="Public Global Stellar Network ; September 2015"
else
    echo "Usage: $0 [testnet|mainnet]"
    exit 1
fi

echo "🍜 SRN Contract Deployment"
echo "   Network: $NETWORK"
echo "   RPC: $RPC"
echo "================================"

# Check for stellar CLI
if ! command -v stellar &> /dev/null; then
    echo "❌ 'stellar' CLI not found. Install: cargo install stellar-cli"
    exit 1
fi

# Read source key
if [ -z "$STELLAR_SOURCE_KEY" ]; then
    echo "❌ Set STELLAR_SOURCE_KEY environment variable"
    exit 1
fi

deploy_contract() {
    local name=$1
    local dir=$2

    echo ""
    echo "📦 Deploying $name..."
    cd "$ROOT_DIR/$dir"

    echo "   Building..."
    cargo build --target wasm32-unknown-unknown --release

    echo "   Deploying..."
    CONTRACT_ID=$(stellar contract deploy \
        --wasm "target/wasm32-unknown-unknown/release/${name}.wasm" \
        --source "$STELLAR_SOURCE_KEY" \
        --network "$NETWORK" \
        --rpc-url "$RPC" \
        2>/dev/null || echo "DEPLOY_FAILED")

    if [ "$CONTRACT_ID" = "DEPLOY_FAILED" ]; then
        echo "   ⚠️  Deploy failed (may need funded source account)"
        return
    fi

    echo "   ✅ Deployed: $CONTRACT_ID"
    echo "$name=$CONTRACT_ID" >> "$ROOT_DIR/.contract-ids"
}

# Deploy all contracts
deploy_contract "restaurant_contract" "contracts/restaurant"
deploy_contract "loyalty_token_contract" "contracts/loyalty-token"
deploy_contract "restaurant_registry_contract" "contracts/restaurant-registry"

echo ""
echo "================================"
echo "✅ Deployment complete"
echo "Contract IDs saved to .contract-ids"
cat "$ROOT_DIR/.contract-ids" 2>/dev/null || echo "(no contracts deployed)"
