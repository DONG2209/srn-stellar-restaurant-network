import React, { useState, useEffect, useCallback } from 'react';
import { getContractClient, MenuItem } from '../utils/contract';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface MenuListProps {
  walletConnected: boolean;
  publicKey: string | null;
  onSelectItem?: (item: MenuItem) => void;
}

export default function MenuList({ walletConnected, onSelectItem }: MenuListProps) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMenu = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = getContractClient();
      const items = await client.getMenu();
      setMenu(items.filter((item) => item.available));
    } catch (err: any) {
      setError(err?.message || 'Failed to load menu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // Loading state
  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📋 Menu</h3>
        <LoadingSpinner size="sm" message="Loading menu..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📋 Menu</h3>
        <ErrorMessage message={error} onRetry={fetchMenu} />
      </div>
    );
  }

  // Empty state
  if (menu.length === 0) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">📋 Menu</h3>
        <div className="text-center py-8">
          <span className="text-4xl block mb-3">🍽️</span>
          <p className="text-white/60">No menu items available yet</p>
          <p className="text-white/30 text-sm mt-1">
            The restaurant admin hasn't added any items
          </p>
        </div>
      </div>
    );
  }

  const filteredMenu = searchQuery
    ? menu.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : menu;

  // Menu items
  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-white font-semibold text-lg">📋 Menu</h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field py-2 text-sm pl-9 pr-4"
              aria-label="Search menu items"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
              🔍
            </span>
          </div>
          <span className="badge-info whitespace-nowrap">{filteredMenu.length} items</span>
        </div>
      </div>

      {searchQuery && filteredMenu.length === 0 && (
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">🔍</span>
          <p className="text-white/60">No items match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-stellar-primary text-sm mt-2 hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      <div className="space-y-3">
        {filteredMenu.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer border border-white/10 hover:border-stellar-primary/30"
            onClick={() => onSelectItem?.(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelectItem?.(item);
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🍜</span>
              <div>
                <p className="text-white font-medium">{item.name}</p>
                <p className="text-white/40 text-xs">ID: {item.id}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-stellar-primary font-bold">
                {(Number(item.price) / 10_000_000).toFixed(2)} XLM
              </p>
              <p className="text-white/30 text-xs">{Number(item.price).toLocaleString()} stroops</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
