import React from 'react';
import { useWallet } from '../hooks/useWallet';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

export default function WalletConnect() {
  const {
    connected,
    publicKey,
    network,
    isLoading,
    error,
    connect,
    disconnect,
    formatPublicKey,
  } = useWallet();

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="card">
        <LoadingSpinner size="sm" message="Connecting wallet..." />
      </div>
    );
  }

  // Connected state
  if (connected && publicKey) {
    return (
      <div className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <span className="text-green-400 text-lg">🟢</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">
              {formatPublicKey(publicKey)}
            </p>
            <p className="text-white/50 text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
              Connected to {network}
            </p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="btn-secondary text-sm py-2 px-4 whitespace-nowrap"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Disconnected state
  return (
    <div className="card">
      {error && (
        <div className="mb-4">
          <ErrorMessage
            message={error}
            onRetry={handleConnect}
            onDismiss={() => {}}
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold">Connect Wallet</h3>
          <p className="text-white/50 text-sm mt-1">
            Connect your Freighter wallet to interact with the dApp
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="btn-primary text-sm py-2 px-6 whitespace-nowrap"
        >
          Connect Wallet
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-white/30">
        <span>Don't have Freighter?</span>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-stellar-primary hover:underline"
        >
          Install Freighter →
        </a>
      </div>
    </div>
  );
}
