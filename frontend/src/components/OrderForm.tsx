import React, { useState, useCallback } from 'react';
import { MenuItem } from '../utils/contract';
import { useWallet } from '../hooks/useWallet';
import { submitDemoTransaction } from '../utils/stellarTx';
import LoadingSpinner from './LoadingSpinner';

interface OrderFormProps {
  selectedItems: Map<number, { item: MenuItem; quantity: number }>;
  onUpdateQuantity: (item: MenuItem, delta: number) => void;
  onOrderPlaced: (orderId: number) => void;
  onClear: () => void;
  onDemoOrder: () => Promise<number>;
  connected: boolean;
  total: number;
  publicKey: string | null;
}

export default function OrderForm({
  selectedItems,
  onUpdateQuantity,
  onOrderPlaced,
  onClear,
  onDemoOrder,
  connected,
  total,
  publicKey,
}: OrderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txExplorerUrl, setTxExplorerUrl] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  const items = Array.from(selectedItems.values());

  const handlePlaceOrder = useCallback(async () => {
    if (!connected) {
      setError('Please connect your wallet first');
      return;
    }

    if (items.length === 0) {
      setError('Please select at least one item');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setTxHash(null);
    setTxError(null);

    try {
      // 1. Save order locally (demo)
      const orderId = await onDemoOrder();

      // 2. Try to submit a real testnet transaction for the tx hash
      if (publicKey) {
        setIsSubmittingTx(true);
        try {
          const result = await submitDemoTransaction(publicKey);
          setTxHash(result.hash);
          setTxExplorerUrl(result.explorerUrl);
        } catch (txErr: any) {
          const msg = txErr?.message || 'Transaction failed';
          console.warn('Real tx error:', msg);
          setTxError(msg);
        } finally {
          setIsSubmittingTx(false);
        }
      }

      setSuccessOrderId(orderId);
      setShowSuccess(true);

      // Auto-reset after 8 seconds (enough time to see tx hash)
      setTimeout(() => {
        setShowSuccess(false);
        setSuccessOrderId(null);
        setTxHash(null);
        setTxExplorerUrl(null);
        onClear();
      }, 8000);
    } catch (err: any) {
      setError(err?.message || 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  }, [connected, items, onDemoOrder, onClear, publicKey]);

  // Success state
  if (showSuccess && successOrderId) {
    return (
      <div className="card border-green-500/30 bg-green-500/10">
        <div className="text-center py-6">
          <span className="text-5xl block mb-4">✅</span>
          <h3 className="text-white font-semibold text-lg mb-2">Order Placed!</h3>
          <p className="text-green-400 font-mono text-lg">
            #{(successOrderId % 100000).toString().padStart(5, '0')}
          </p>
          <p className="text-white/50 text-sm mt-2">Your food is being prepared...</p>

          {/* Real Transaction Hash */}
          {isSubmittingTx && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <LoadingSpinner size="sm" message="Submitting transaction to Stellar..." />
            </div>
          )}

          {txHash && (
            <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-left">
              <p className="text-green-400 text-xs uppercase tracking-wider mb-2">
                🔗 Transaction Confirmed
              </p>
              <p className="text-white font-mono text-xs break-all mb-2">
                {txHash}
              </p>
              {txExplorerUrl && (
                <a
                  href={txExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stellar-primary text-xs hover:underline inline-flex items-center gap-1"
                >
                  View on Stellar Expert →
                </a>
              )}
              <p className="text-white/30 text-[10px] mt-2">
                💡 This is a real testnet transaction signed by your wallet
              </p>
            </div>
          )}

          {!isSubmittingTx && !txHash && txError && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
              <p className="text-red-400 text-xs uppercase tracking-wider mb-1">
                ⚠️ Transaction Failed
              </p>
              <p className="text-white/60 text-xs">{txError}</p>
              <p className="text-white/30 text-[10px] mt-1">
                Order saved locally. Make sure your wallet is on testnet and has funds.
              </p>
            </div>
          )}

          {!isSubmittingTx && !txHash && !txError && (
            <p className="text-white/20 text-xs mt-3">
              (demo mode — no blockchain transaction)
            </p>
          )}

          <div className="mt-4 flex justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Empty cart state
  if (items.length === 0) {
    return (
      <div className="card">
        <h3 className="text-white font-semibold text-lg mb-4">🛒 Your Order</h3>
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">🛍️</span>
          <p className="text-white/60">Your cart is empty</p>
          <p className="text-white/30 text-sm mt-1">
            Select items from the menu to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">🛒 Your Order</h3>
        <button
          onClick={onClear}
          className="text-white/40 hover:text-red-400 transition-colors text-sm"
        >
          Clear All
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-2">
            <span className="text-red-400 flex-shrink-0">⚠️</span>
            <p className="text-white/80 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-4">
        {items.map(({ item, quantity }) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-white/5 rounded-xl"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{item.name}</p>
              <p className="text-white/40 text-xs">
                {(item.price / 10_000_000).toFixed(2)} XLM each
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button
                onClick={() => onUpdateQuantity(item, -1)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label={`Decrease quantity of ${item.name}`}
              >
                −
              </button>
              <span className="text-white font-mono w-6 text-center">
                {quantity}
              </span>
              <button
                onClick={() => onUpdateQuantity(item, 1)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label={`Increase quantity of ${item.name}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-white/60">Total</span>
          <span className="text-white font-bold text-lg">
            {(total / 10_000_000).toFixed(2)} XLM
          </span>
        </div>

        <div className="text-white/30 text-xs text-center">
          💡 Demo mode — no real XLM will be spent
        </div>

        <button
          onClick={handlePlaceOrder}
          disabled={!connected || isSubmitting}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <LoadingSpinner size="sm" />
              Placing Order...
            </>
          ) : (
            'Place Order (Demo)'
          )}
        </button>

        {!connected && (
          <p className="text-yellow-400 text-xs text-center">
            Connect your wallet to place an order
          </p>
        )}
      </div>
    </div>
  );
}
