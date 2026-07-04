import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { getContractClient } from '../../utils/contract';
import LoadingSpinner from '../LoadingSpinner';

// =====================================================
//  AdminDashboard - SRN Level 4
//  Restaurant owner dashboard with order management,
//  revenue analytics, loyalty stats, and cross-border
//  payment tracking.
// =====================================================

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
  totalLoyaltyIssued: number;
  completedOrders: number;
  avgOrderValue: number;
  topItems: { name: string; count: number }[];
  revenueByCurrency: { currency: string; amount: number }[];
  dailyStats: { date: string; orders: number; revenue: number }[];
}

interface OrderItem {
  menu_item_id: number;
  quantity: number;
  price_per_unit: number;
}

interface Order {
  id: number;
  customer: string;
  items: OrderItem[];
  total_amount: number;
  status: string;
  timestamp: number;
  loyalty_earned: number;
  loyalty_redeemed: number;
  currency: string;
}

export default function AdminDashboard() {
  const { connected, publicKey } = useWallet();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'overview' | 'orders' | 'loyalty' | 'settings'>('overview');

  // Settings state
  const [isOpen, setIsOpen] = useState(true);
  const [earnRate, setEarnRate] = useState(500); // basis points
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('500');
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(['USDC', 'VND', 'JPY', 'THB', 'IDR']);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const contractClient = getContractClient();

  useEffect(() => {
    loadDashboardData();
  }, [connected, publicKey]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // In production, fetch from contract and backend API
      // For demo, generate realistic sample data
      const sampleAnalytics: Analytics = {
        totalOrders: 156,
        totalRevenue: 45_600_000_000,
        totalLoyaltyIssued: 2_340_000,
        completedOrders: 142,
        avgOrderValue: 292_000_000,
        topItems: [
          { name: 'Pho Bo', count: 48 },
          { name: 'Bun Cha', count: 35 },
          { name: 'Ca Phe Sua Da', count: 29 },
          { name: 'Goi Cuon', count: 22 },
          { name: 'Banh Mi', count: 14 },
        ],
        revenueByCurrency: [
          { currency: 'USDC', amount: 32_400_000_000 },
          { currency: 'VND', amount: 8_200_000_000 },
          { currency: 'JPY', amount: 5_000_000_000 },
        ],
        dailyStats: generateDailyStats(),
      };

      const sampleOrders: Order[] = [
        { id: 1, customer: 'GALICE...X4F2', items: [{ menu_item_id: 1, quantity: 2, price_per_unit: 50000000 }], total_amount: 100_000_000, status: 'Completed', timestamp: Date.now() / 1000 - 3600, loyalty_earned: 5000, loyalty_redeemed: 0, currency: 'USDC' },
        { id: 2, customer: 'GBOB...Y7K3', items: [{ menu_item_id: 2, quantity: 1, price_per_unit: 35000000 }], total_amount: 35_000_000, status: 'Preparing', timestamp: Date.now() / 1000 - 1800, loyalty_earned: 1750, loyalty_redeemed: 1000, currency: 'VND' },
        { id: 3, customer: 'GTOKYO...M9P1', items: [{ menu_item_id: 1, quantity: 1, price_per_unit: 50000000 }], total_amount: 50_000_000, status: 'Completed', timestamp: Date.now() / 1000 - 900, loyalty_earned: 2500, loyalty_redeemed: 0, currency: 'JPY' },
        { id: 4, customer: 'GCHARLIE...W2N8', items: [{ menu_item_id: 3, quantity: 3, price_per_unit: 25000000 }], total_amount: 75_000_000, status: 'Placed', timestamp: Date.now() / 1000 - 300, loyalty_earned: 0, loyalty_redeemed: 0, currency: 'USDC' },
        { id: 5, customer: 'GDONG...H6L2', items: [{ menu_item_id: 5, quantity: 2, price_per_unit: 12000000 }, { menu_item_id: 4, quantity: 1, price_per_unit: 15000000 }], total_amount: 39_000_000, status: 'Ready', timestamp: Date.now() / 1000 - 120, loyalty_earned: 1950, loyalty_redeemed: 500, currency: 'VND' },
      ];

      setAnalytics(sampleAnalytics);
      setOrders(sampleOrders);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = useCallback((orderId: number, newStatus: string) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: newStatus } : o
    ));
  }, []);

  const formatAmount = (amount: number): string => {
    // Convert from stroops (×10^7) to display units
    const display = amount / 10_000_000;
    if (display >= 1_000_000) return `${(display / 1_000_000).toFixed(1)}M`;
    if (display >= 1_000) return `${(display / 1_000).toFixed(1)}K`;
    return display.toFixed(0);
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) return <LoadingSpinner size="lg" message="Loading dashboard..." />;

  if (!connected) {
    return (
      <div className="card text-center py-12">
        <span className="text-4xl">🔒</span>
        <h2 className="text-white font-bold text-lg mt-4">Admin Dashboard</h2>
        <p className="text-white/50 mt-2">Connect your admin wallet to access the dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <span>📊</span> Restaurant Dashboard
            </h2>
            <p className="text-white/50 text-sm mt-1">SRN Level 4 — Stellar Restaurant Network</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📝" label="Total Orders" value={analytics?.totalOrders.toString() || '0'} trend="+12%" />
        <StatCard icon="💰" label="Total Revenue" value={`$${formatAmount(analytics?.totalRevenue || 0)}`} trend="+18%" />
        <StatCard icon="⭐" label="Loyalty Issued" value={`${formatAmount(analytics?.totalLoyaltyIssued || 0)} pts`} trend="+24%" />
        <StatCard icon="✅" label="Completion Rate" value={`${analytics ? Math.round((analytics.completedOrders / analytics.totalOrders) * 100) : 0}%`} trend="91%" />
      </div>

      {/* Section Navigation */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1">
        {(['overview', 'orders', 'loyalty', 'settings'] as const).map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${
              activeSection === section
                ? 'bg-stellar-primary text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Top Selling Items */}
          <div className="card">
            <h3 className="text-white font-bold mb-4">🏆 Top Selling Items</h3>
            <div className="space-y-3">
              {analytics?.topItems.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white/30 text-xs w-6 text-right">{idx + 1}</span>
                    <span className="text-white/80 text-sm">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-stellar-primary rounded-full transition-all duration-500"
                        style={{ width: `${(item.count / (analytics?.topItems[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-white/50 text-xs w-12 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue by Currency */}
          <div className="card">
            <h3 className="text-white font-bold mb-4">💱 Revenue by Currency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {analytics?.revenueByCurrency.map((rc) => (
                <div key={rc.currency} className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">${formatAmount(rc.amount)}</p>
                  <p className="text-white/40 text-xs mt-1">{rc.currency}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Orders Chart (simple bar chart) */}
          <div className="card">
            <h3 className="text-white font-bold mb-4">📈 Daily Orders (Last 7 Days)</h3>
            <div className="flex items-end gap-2 h-32">
              {analytics?.dailyStats.map((day) => {
                const maxOrders = Math.max(...(analytics?.dailyStats.map(d => d.orders) || [1]));
                const heightPct = (day.orders / maxOrders) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-white/70 text-xs font-medium">{day.orders}</span>
                    <div
                      className="w-full bg-stellar-primary/30 rounded-t hover:bg-stellar-primary/60 transition-colors"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      title={`${day.date}: ${day.orders} orders, $${formatAmount(day.revenue)}`}
                    />
                    <span className="text-white/30 text-[10px]">{day.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'orders' && (
        <div className="card overflow-x-auto">
          <h3 className="text-white font-bold mb-4">📋 Order Management</h3>
          <div className="min-w-full">
            {/* Mobile: card-based layout */}
            <div className="block sm:hidden space-y-3">
              {orders.map(order => (
                <div key={order.id} className="bg-white/5 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">Order #{order.id}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-white/50 text-xs">{formatDate(order.timestamp)}</p>
                  <p className="text-white/70 text-sm">{order.customer.slice(0, 10)}...</p>
                  <div className="flex items-center justify-between">
                    <span className="text-stellar-primary font-bold">${formatAmount(order.total_amount)}</span>
                    <span className="text-white/40 text-xs">⭐ {order.loyalty_earned} pts</span>
                  </div>
                  <div className="flex gap-1">
                    {['Placed', 'Preparing', 'Ready', 'Completed', 'Cancelled'].map(s => (
                      <button
                        key={s}
                        onClick={() => handleUpdateStatus(order.id, s)}
                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                          order.status === s
                            ? 'bg-stellar-primary text-white'
                            : 'bg-white/10 text-white/40 hover:text-white/70'
                        }`}
                      >
                        {s.slice(0, 4)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table layout */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs border-b border-white/10">
                  <th className="text-left py-3 px-2">#ID</th>
                  <th className="text-left py-3 px-2">Customer</th>
                  <th className="text-left py-3 px-2">Items</th>
                  <th className="text-right py-3 px-2">Amount</th>
                  <th className="text-center py-3 px-2">Currency</th>
                  <th className="text-center py-3 px-2">Loyalty</th>
                  <th className="text-center py-3 px-2">Status</th>
                  <th className="text-center py-3 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-2 text-white font-mono text-xs">#{order.id}</td>
                    <td className="py-3 px-2 text-white/60 text-xs font-mono">{order.customer.slice(0, 8)}...</td>
                    <td className="py-3 px-2 text-white/60 text-xs">{order.items.length} items</td>
                    <td className="py-3 px-2 text-right text-white font-mono text-xs">${formatAmount(order.total_amount)}</td>
                    <td className="py-3 px-2 text-center text-white/40 text-xs">{order.currency}</td>
                    <td className="py-3 px-2 text-center text-yellow-400/80 text-xs">⭐ {order.loyalty_earned}</td>
                    <td className="py-3 px-2 text-center"><StatusBadge status={order.status} /></td>
                    <td className="py-3 px-2 text-center">
                      <select
                        value={order.status}
                        onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                        className="bg-white/10 text-white/70 text-[10px] rounded px-1 py-0.5 border border-white/10"
                      >
                        {['Placed', 'Preparing', 'Ready', 'Completed', 'Cancelled'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'loyalty' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-white font-bold mb-4">⭐ Loyalty Program Stats</h3>
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-white/40 text-xs mb-1">Total Loyalty Points Issued</p>
                <p className="text-3xl font-bold text-yellow-400">{formatAmount(analytics?.totalLoyaltyIssued || 0)}</p>
                <p className="text-white/30 text-xs mt-1">SRNP Tokens</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-white/40 text-xs">Earn Rate</p>
                  <p className="text-white font-bold text-lg">5.0%</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-white/40 text-xs">Redeem Rate</p>
                  <p className="text-white font-bold text-lg">1 pt = 20₫</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs mb-2">Points Earned vs Redeemed</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-green-500/60 rounded-l" style={{ width: '70%' }} />
                  <div className="flex-1 h-3 bg-red-500/40 rounded-r" style={{ width: '30%' }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-green-400 text-[10px]">70% Earned</span>
                  <span className="text-red-400 text-[10px]">30% Redeemed</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <h3 className="text-white font-bold mb-4">🏪 Cross-Border Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span>🇯🇵</span>
                  <span className="text-white/70 text-sm">Japan → Vietnam</span>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-mono">$1,200</p>
                  <p className="text-white/30 text-[10px]">12 orders</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span>🇹🇭</span>
                  <span className="text-white/70 text-sm">Thailand → Vietnam</span>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-mono">$650</p>
                  <p className="text-white/30 text-[10px]">8 orders</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span>🇺🇸</span>
                  <span className="text-white/70 text-sm">US → Vietnam</span>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-mono">$3,400</p>
                  <p className="text-white/30 text-[10px]">27 orders</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span>🇮🇩</span>
                  <span className="text-white/70 text-sm">Indonesia → Vietnam</span>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-mono">$380</p>
                  <p className="text-white/30 text-[10px]">5 orders</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'settings' && (
        <div className="card space-y-4">
          <h3 className="text-white font-bold mb-4">⚙️ Restaurant Settings</h3>

          {/* Toast notification */}
          {toastMsg && (
            <div className="bg-green-500/20 text-green-400 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
              <span>{toastMsg}</span>
              <button onClick={() => setToastMsg(null)} className="text-white/50 hover:text-white ml-2">✕</button>
            </div>
          )}

          {/* Withdraw confirmation modal */}
          {showWithdrawConfirm && (
            <div className="bg-stellar-primary/10 border border-stellar-primary/30 rounded-lg p-4 space-y-3">
              <p className="text-white text-sm font-medium">Confirm Withdrawal</p>
              <p className="text-white/70 text-xs">Withdraw ${formatAmount(analytics?.totalRevenue || 0)} to your admin wallet?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowWithdrawConfirm(false); setToastMsg('✅ Withdrawn $' + formatAmount(analytics?.totalRevenue || 0) + ' successfully!'); }}
                  className="px-4 py-2 bg-stellar-primary text-white rounded-lg text-sm font-medium hover:bg-stellar-primary/80 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowWithdrawConfirm(false)}
                  className="px-4 py-2 bg-white/10 text-white/70 rounded-lg text-sm hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {/* Restaurant Status */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium text-sm">Restaurant Status</p>
                <p className="text-white/40 text-xs">{isOpen ? 'Accepting orders' : 'Currently closed'}</p>
              </div>
              <button
                onClick={() => { setIsOpen(!isOpen); setToastMsg(isOpen ? '🔴 Restaurant closed' : '🟢 Restaurant opened!'); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isOpen ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
              >
                {isOpen ? '🟢 Open' : '🔴 Closed'}
              </button>
            </div>

            {/* Loyalty Earn Rate */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium text-sm">Loyalty Earn Rate</p>
                <p className="text-white/40 text-xs">Current: {(earnRate / 100).toFixed(1)}% ({earnRate} bps)</p>
              </div>
              {editingRate ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="input-field py-1.5 text-sm w-20 text-center"
                    min="0"
                    max="10000"
                  />
                  <button
                    onClick={() => {
                      const val = Math.max(0, Math.min(10000, parseInt(rateInput) || 500));
                      setEarnRate(val);
                      setEditingRate(false);
                      setToastMsg(`✅ Loyalty rate updated to ${(val / 100).toFixed(1)}%`);
                    }}
                    className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/30"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setEditingRate(false); setRateInput(String(earnRate)); }}
                    className="px-2 py-1.5 text-white/40 hover:text-white/70 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingRate(true); setRateInput(String(earnRate)); }}
                  className="px-4 py-2 bg-white/10 text-white/70 rounded-lg text-sm hover:bg-white/20 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {/* Accepted Currencies */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium text-sm">Accepted Currencies</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {activeCurrencies.map(c => (
                    <span key={c} className="text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end max-w-[180px]">
                {['USDC', 'VND', 'JPY', 'THB', 'IDR'].map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      const updated = activeCurrencies.includes(c)
                        ? activeCurrencies.filter(x => x !== c)
                        : [...activeCurrencies, c];
                      if (updated.length === 0) return; // must have at least 1
                      setActiveCurrencies(updated);
                      setToastMsg(`💱 Currencies updated (${updated.length} active)`);
                    }}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${
                      activeCurrencies.includes(c)
                        ? 'bg-stellar-primary/30 text-stellar-primary'
                        : 'bg-white/5 text-white/30 hover:text-white/50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Withdraw Revenue */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white font-medium text-sm">Withdraw Revenue</p>
                <p className="text-white/40 text-xs">Available: ${formatAmount(analytics?.totalRevenue || 0)}</p>
              </div>
              <button
                onClick={() => setShowWithdrawConfirm(true)}
                className="px-4 py-2 bg-stellar-primary/20 text-stellar-primary rounded-lg text-sm font-medium hover:bg-stellar-primary/30 transition-colors"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Sub-components ====================

function StatCard({ icon, label, value, trend }: {
  icon: string;
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="card text-center hover:border-stellar-primary/30 transition-all duration-300">
      <span className="text-2xl">{icon}</span>
      <p className="text-2xl font-bold text-white mt-2">{value}</p>
      <p className="text-white/40 text-xs mt-1">{label}</p>
      <p className="text-green-400 text-xs font-medium mt-1">{trend}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Placed: 'bg-blue-500/20 text-blue-400',
    Preparing: 'bg-yellow-500/20 text-yellow-400',
    Ready: 'bg-purple-500/20 text-purple-400',
    Completed: 'bg-green-500/20 text-green-400',
    Cancelled: 'bg-red-500/20 text-red-400',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[status] || 'bg-white/10 text-white/50'}`}>
      {status}
    </span>
  );
}

function generateDailyStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().split('T')[0],
      orders: Math.floor(Math.random() * 15) + 5,
      revenue: Math.floor(Math.random() * 5_000_000_000) + 1_000_000_000,
    });
  }
  return days;
}
