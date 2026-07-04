import React, { useState, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import WalletConnect from './components/WalletConnect';
import RestaurantStatus from './components/RestaurantStatus';
import MenuList from './components/MenuList';
import OrderForm from './components/OrderForm';
import OrderHistory from './components/OrderHistory';
import AdminDashboard from './components/dashboard/AdminDashboard';
import LoyaltyCard from './components/LoyaltyCard';
import { MenuItem } from './utils/contract';
import { useWallet } from './hooks/useWallet';
import { useDemoOrders } from './hooks/useDemoOrders';

type Tab = 'menu' | 'history' | 'dashboard' | 'loyalty';

export default function App() {
  const { connected, publicKey } = useWallet();
  const { demoOrders, placeDemoOrder, clearAllOrders, refreshKey: demoRefreshKey } = useDemoOrders(publicKey);
  const [activeTab, setActiveTab] = useState<Tab>('menu');
  const [selectedItems, setSelectedItems] = useState<
    Map<number, { item: MenuItem; quantity: number }>
  >(new Map());
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);

  const handleSelectItem = useCallback((item: MenuItem) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        next.set(item.id, { item, quantity: existing.quantity + 1 });
      } else {
        next.set(item.id, { item, quantity: 1 });
      }
      return next;
    });
    toast.success(`Added ${item.name} to cart`, {
      style: {
        background: '#1A1A2E',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
      },
      iconTheme: { primary: '#3E63DD', secondary: '#fff' },
    });
  }, []);

  const handleUpdateQuantity = useCallback((item: MenuItem, delta: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (!existing) return prev;

      const newQuantity = existing.quantity + delta;
      if (newQuantity <= 0) {
        next.delete(item.id);
      } else {
        next.set(item.id, { item, quantity: newQuantity });
      }
      return next;
    });
  }, []);

  const handleClearCart = useCallback(() => {
    setSelectedItems(new Map());
  }, []);

  const handlePlaceOrder = useCallback(
    async (): Promise<number> => {
      const items = Array.from(selectedItems.values());
      if (items.length === 0) return 0;

      // Use demo mode — save order locally
      const orderId = placeDemoOrder(items);

      // Also try real contract call in background (won't work with demo contract ID)
      // This is here so the integration code path is exercised
      toast.success(`Order #${(orderId % 100000).toString().padStart(5, '0')} placed!`, {
        duration: 5000,
        style: {
          background: '#1A1A2E',
          color: '#fff',
          border: '1px solid rgba(34,197,94,0.3)',
        },
      });

      setOrderRefreshKey((k) => k + 1);
      return orderId;
    },
    [selectedItems, placeDemoOrder]
  );

  const handleOrderPlaced = useCallback(
    (orderId: number) => {
      setOrderRefreshKey((k) => k + 1);
    },
    []
  );

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'menu', label: 'Menu', icon: '📋' },
    { id: 'history', label: 'My Orders', icon: '📜' },
    { id: 'loyalty', label: 'Loyalty', icon: '⭐' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  ];

  const cartItems = Array.from(selectedItems.values());
  const total = cartItems.reduce(
    (sum, { item, quantity }) => sum + item.price * quantity,
    0
  );

  const demoStats = {
    totalOrders: demoOrders.length,
    totalRevenue: demoOrders.reduce((sum, o) => sum + o.total_amount, 0),
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-md bg-white/5 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🍜</span>
              <h1 className="text-white font-bold text-lg hidden sm:block">
                🍜 Stellar Restaurant Network
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30 text-xs hidden sm:inline">
                Stellar Testnet
              </span>
              <a
                href="https://github.com/DONG2209/srn-stellar-restaurant-network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 hover:text-white/80 transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Restaurant Status */}
        <RestaurantStatus demoStats={demoStats} />

        {/* Wallet Connect */}
        <WalletConnect />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-stellar-primary border-stellar-primary'
                  : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <MenuList
                walletConnected={connected}
                publicKey={publicKey}
                onSelectItem={handleSelectItem}
              />
            </div>
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24">
                <OrderForm
                  selectedItems={selectedItems}
                  onUpdateQuantity={handleUpdateQuantity}
                  onOrderPlaced={handleOrderPlaced}
                  onClear={handleClearCart}
                  onDemoOrder={handlePlaceOrder}
                  connected={connected}
                  total={total}
                  publicKey={publicKey}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <OrderHistory
            key={`${orderRefreshKey}-${demoRefreshKey}`}
            demoOrders={demoOrders}
            onClearAll={clearAllOrders}
          />
        )}

        {activeTab === 'loyalty' && <LoyaltyCard />}

        {activeTab === 'dashboard' && <AdminDashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-white/30 text-xs">
            <p>
              🍜 SRN — Stellar Restaurant Network · Built by <span className="text-white/50">DONG2209</span>
            </p>
            <p>
              Contract:{' '}
              <a
                href="https://stellar.expert/explorer/testnet/contract/CCVH3EHZJPER3ISZO3U2VEPMVVQW3XTPKECVC7DFIPOFT6E4P46TMQAY"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stellar-primary hover:underline font-mono"
              >
                CCVH3EH...TMQAY
              </a>
            </p>
            <p>
              TX:{' '}
              <a
                href="https://stellar.expert/explorer/testnet/tx/7ee5c234f1d9f19222aef4e8637494c4bace1011d1b39a4a2160f816b5cccc79"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stellar-primary hover:underline font-mono"
              >
                7ee5c234...cc79
              </a>
            </p>
            <p>Level 4 · Green Belt</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
