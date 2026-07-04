import React, { useState, useEffect, useCallback } from 'react';
import { getContractClient, Order } from '../utils/contract';
import { useWallet } from '../hooks/useWallet';
import LoadingSpinner from './LoadingSpinner';

interface DemoOrder extends Order {
  demoOrderId: number;
  itemDetails: Array<{ name: string; price: number; quantity?: number }>;
  createdAt: string;
}

interface OrderHistoryProps {
  demoOrders: DemoOrder[];
  onClearAll?: () => void;
}

const statusStyles: Record<string, { color: string; icon: string; badge: string }> = {
  Placed: { color: 'text-blue-400', icon: '📝', badge: 'badge-info' },
  Preparing: { color: 'text-yellow-400', icon: '👨‍🍳', badge: 'badge-warning' },
  Ready: { color: 'text-green-400', icon: '✅', badge: 'badge-success' },
  Completed: { color: 'text-green-300', icon: '🎉', badge: 'badge-success' },
  Cancelled: { color: 'text-red-400', icon: '❌', badge: 'badge bg-red-500/20 text-red-400 border border-red-500/30' },
};

export default function OrderHistory({ demoOrders, onClearAll }: OrderHistoryProps) {
  const { connected, publicKey } = useWallet();
  const [contractOrders, setContractOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!publicKey) return;
    setIsLoading(true);
    try {
      const client = getContractClient();
      const result = await client.getCustomerOrders(publicKey);
      setContractOrders(result);
    } catch {
      // Demo mode — contract calls fail gracefully
      setContractOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchOrders();
    } else {
      setContractOrders([]);
    }
  }, [connected, publicKey, fetchOrders]);

  // Merge demo + contract orders, newest first
  const allOrders = [...demoOrders, ...contractOrders].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  // Not connected
  if (!connected) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📜 My Orders</h3>
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">🔒</span>
          <p className="text-white/60">Connect your wallet to view your orders</p>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📜 My Orders</h3>
        <LoadingSpinner size="sm" message="Loading orders..." />
      </div>
    );
  }

  // Empty
  if (allOrders.length === 0) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📜 My Orders</h3>
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">📭</span>
          <p className="text-white/60">No orders yet</p>
          <p className="text-white/30 text-sm mt-1">
            Place your first order from the menu
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">📜 My Orders</h3>
        <div className="flex items-center gap-2">
          {onClearAll && demoOrders.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-white/30 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded-lg border border-white/10 hover:border-red-400/30"
              title="Clear all demo orders"
            >
              🗑 Clear
            </button>
          )}
          <button
            onClick={fetchOrders}
            className="text-white/40 hover:text-white/80 transition-colors text-sm p-1"
            aria-label="Refresh orders"
            title="Refresh"
          >
            🔄
          </button>
          <span className="badge-info">{allOrders.length} orders</span>
        </div>
      </div>
      <div className="space-y-3">
        {allOrders.map((order) => {
          const status = statusStyles[order.status] || statusStyles.Placed;
          const demo = order as DemoOrder;
          const isDemo = !!demo.demoOrderId;

          return (
            <div
              key={`${isDemo ? 'demo' : 'chain'}-${order.id}-${order.timestamp}`}
              className={`p-4 rounded-xl border transition-colors ${
                isDemo
                  ? 'bg-yellow-500/5 border-yellow-500/20'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">
                    #{String(order.id).padStart(5, '0')}
                  </span>
                  {isDemo && (
                    <span className="text-yellow-400/50 text-[10px] uppercase tracking-wider border border-yellow-400/20 rounded px-1.5 py-0.5">
                      Demo
                    </span>
                  )}
                </div>
                <span className={`${status.badge} flex items-center gap-1`}>
                  {status.icon} {order.status}
                </span>
              </div>

              {/* Item breakdown for demo orders */}
              {isDemo && demo.itemDetails && (
                <div className="mb-2 space-y-1">
                  {demo.itemDetails.map((d, i) => (
                    <div key={i} className="flex justify-between text-white/55 text-xs">
                      <span>{d.quantity || 1}× {d.name}</span>
                      <span className="font-mono">{(d.price / 10_000_000).toFixed(2)} XLM</span>
                    </div>
                  ))}
                </div>
              )}

              {!isDemo && (
                <div className="text-white/40 text-xs mb-2">{order.items.length} item(s)</div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-stellar-primary font-mono text-sm font-semibold">
                  {(order.total_amount / 10_000_000).toFixed(2)} XLM
                </span>
                <span className="text-white/25 text-[10px]">
                  {isDemo && demo.createdAt
                    ? new Date(demo.createdAt).toLocaleTimeString()
                    : new Date(Number(order.timestamp) * 1000).toLocaleString()}
                </span>
              </div>

              {/* Progress bar for demo orders */}
              {isDemo && order.status !== 'Completed' && order.status !== 'Cancelled' && (
                <div className="mt-3 flex gap-1">
                  {['Placed', 'Preparing', 'Ready'].map((s) => {
                    const steps = ['Placed', 'Preparing', 'Ready'];
                    const currentIdx = steps.indexOf(order.status);
                    const stepIdx = steps.indexOf(s);
                    return (
                      <div
                        key={s}
                        className={`flex-1 h-1 rounded-full transition-all duration-700 ${
                          stepIdx <= currentIdx
                            ? stepIdx === currentIdx
                              ? 'bg-stellar-primary animate-pulse'
                              : 'bg-green-500/60'
                            : 'bg-white/10'
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
