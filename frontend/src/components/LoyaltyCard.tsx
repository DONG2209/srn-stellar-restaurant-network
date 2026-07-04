import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';

// =====================================================
//  LoyaltyCard - SRN Level 4
//  Customer-facing loyalty points display.
//  Shows SRNP balance, earn history, redeem options,
//  and cross-restaurant points portability.
// =====================================================

interface LoyaltyTransaction {
  id: string;
  type: 'earn' | 'redeem' | 'transfer';
  restaurant: string;
  amount: number;
  description: string;
  timestamp: number;
  txHash: string;
}

export default function LoyaltyCard() {
  const { connected, publicKey } = useWallet();
  const [balance, setBalance] = useState(1250);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLoyaltyData();
  }, [connected, publicKey]);

  const loadLoyaltyData = async () => {
    setLoading(true);
    // In production, fetch balance from LoyaltyToken contract
    // and transaction history from the event indexer
    const sampleTransactions: LoyaltyTransaction[] = [
      {
        id: '1',
        type: 'earn',
        restaurant: 'Pho Ha Noi',
        amount: 500,
        description: 'Payment for Order #42 — 2× Pho Bo',
        timestamp: Date.now() / 1000 - 86400 * 3,
        txHash: 'b4001174...1603',
      },
      {
        id: '2',
        type: 'earn',
        restaurant: 'Bun Cha 34',
        amount: 350,
        description: 'Payment for Order #43 — 1× Bun Cha',
        timestamp: Date.now() / 1000 - 86400 * 2,
        txHash: 'cd7053bd...8b8b',
      },
      {
        id: '3',
        type: 'redeem',
        restaurant: 'Pho Ha Noi',
        amount: 200,
        description: 'Redeemed 200 pts = ₫4,000 discount',
        timestamp: Date.now() / 1000 - 86400,
        txHash: '7ee5c234...cc79',
      },
      {
        id: '4',
        type: 'earn',
        restaurant: 'Sushi Tokyo',
        amount: 800,
        description: 'Cross-border: JPY payment → 800 SRNP earned',
        timestamp: Date.now() / 1000 - 3600 * 5,
        txHash: 'e9f8a123...d45b',
      },
      {
        id: '5',
        type: 'transfer',
        restaurant: 'N/A',
        amount: 200,
        description: 'Received from GBOB...Y7K3 (gift)',
        timestamp: Date.now() / 1000 - 3600 * 12,
        txHash: 'a1b2c3d4...e5f6',
      },
    ];

    setBalance(sampleTransactions.reduce((sum, t) => {
      if (t.type === 'redeem' || (t.type === 'transfer' && t.amount < 0)) return sum - t.amount;
      return sum + t.amount;
    }, 0));
    setTransactions(sampleTransactions);
    setLoading(false);
  };

  const formatTime = (timestamp: number): string => {
    const diff = Date.now() / 1000 - timestamp;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (!connected) {
    return (
      <div className="card text-center py-12">
        <span className="text-4xl">⭐</span>
        <h2 className="text-white font-bold text-lg mt-4">Loyalty Points</h2>
        <p className="text-white/50 mt-2">Connect your wallet to view your SRNP loyalty points</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <p className="text-white/50 text-sm">Your Loyalty Balance</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-5xl font-bold text-yellow-400">{balance.toLocaleString()}</span>
            <span className="text-white/40 text-lg">SRNP</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-white/40 text-xs">≈ ${(balance * 0.02).toFixed(2)} USD value</span>
            <span className="text-white/20 text-xs">•</span>
            <span className="text-white/40 text-xs">Earn 5% on every payment</span>
          </div>
          {/* Quick Actions */}
          <div className="flex gap-2 mt-4">
            <button className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-500/30 transition-colors">
              🎁 Redeem Points
            </button>
            <button className="px-4 py-2 bg-white/10 text-white/70 rounded-lg text-sm hover:bg-white/20 transition-colors">
              📤 Send to Friend
            </button>
          </div>
        </div>
      </div>

      {/* Earn Rate Info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <span className="text-2xl">🏪</span>
          <p className="text-white font-bold text-sm mt-1">5</p>
          <p className="text-white/30 text-[10px]">Partner Restaurants</p>
        </div>
        <div className="card text-center">
          <span className="text-2xl">💎</span>
          <p className="text-white font-bold text-sm mt-1">5.0%</p>
          <p className="text-white/30 text-[10px]">Earn Rate</p>
        </div>
        <div className="card text-center">
          <span className="text-2xl">🌏</span>
          <p className="text-white font-bold text-sm mt-1">4</p>
          <p className="text-white/30 text-[10px]">Countries</p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card">
        <h3 className="text-white font-bold mb-4">📜 Loyalty Activity</h3>
        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/40 text-sm">No loyalty transactions yet</p>
            <p className="text-white/20 text-xs mt-1">Start earning by placing orders at partner restaurants</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${tx.type === 'earn' ? '' : tx.type === 'redeem' ? '' : ''}`}>
                    {tx.type === 'earn' ? '🟢' : tx.type === 'redeem' ? '🔴' : '🔵'}
                  </span>
                  <div>
                    <p className="text-white/80 text-sm">{tx.restaurant}</p>
                    <p className="text-white/40 text-xs">{tx.description}</p>
                    <p className="text-white/20 text-[10px] mt-0.5">{formatTime(tx.timestamp)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold font-mono ${
                    tx.type === 'earn' ? 'text-green-400' : tx.type === 'redeem' ? 'text-red-400' : 'text-blue-400'
                  }`}>
                    {tx.type === 'earn' ? '+' : tx.type === 'redeem' ? '-' : ''}{tx.amount} SRNP
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
