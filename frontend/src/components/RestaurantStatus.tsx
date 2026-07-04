import React, { useState, useEffect, useCallback } from 'react';
import { getContractClient, RestaurantConfig } from '../utils/contract';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface DemoStats {
  totalOrders: number;
  totalRevenue: number;
}

interface Props {
  demoStats?: DemoStats;
}

export default function RestaurantStatus({ demoStats }: Props) {
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = getContractClient();
      const result = await client.getConfig();
      setConfig(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to load restaurant info');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const totalOrders = (config?.total_orders ?? 0) + (demoStats?.totalOrders ?? 0);
  const totalRevenue = Number(config?.total_revenue ?? 0) + (demoStats?.totalRevenue ?? 0);

  // Loading state
  if (isLoading) {
    return (
      <div className="card">
        <LoadingSpinner size="sm" message="Loading restaurant info..." />
      </div>
    );
  }

  // Error / fallback
  if (error || !config) {
    return (
      <div className="card">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏪</span>
          <div>
            <h2 className="text-white font-bold text-xl">Restaurant dApp (Demo)</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full inline-block bg-green-400 animate-pulse" />
                Open
              </span>
              <span className="text-white/20">·</span>
              <span className="text-white/40 text-xs">{totalOrders} orders</span>
              <span className="text-white/20">·</span>
              <span className="text-white/40 text-xs">
                {(totalRevenue / 10_000_000).toFixed(2)} XLM revenue
              </span>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorMessage message={error} onRetry={fetchConfig} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏪</span>
          <div>
            <h2 className="text-white font-bold text-xl">{config.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span
                className={`flex items-center gap-1 text-xs ${
                  config.is_open ? 'text-green-400' : 'text-red-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full inline-block ${
                    config.is_open ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                  }`}
                />
                {config.is_open ? 'Open' : 'Closed'}
              </span>
              <span className="text-white/20">·</span>
              <span className="text-white/40 text-xs">{totalOrders} orders</span>
              <span className="text-white/20">·</span>
              <span className="text-white/40 text-xs">
                {(totalRevenue / 10_000_000).toFixed(2)} XLM revenue
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-success text-xs">Stellar Testnet</span>
          <button
            onClick={fetchConfig}
            className="text-white/40 hover:text-white/80 transition-colors text-sm p-2"
            aria-label="Refresh restaurant info"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>
    </div>
  );
}
