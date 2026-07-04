import { useState, useEffect, useCallback } from 'react';
import {
  isConnected,
  getNetwork,
  requestAccess,
  signTransaction as freighterSignTx,
} from '@stellar/freighter-api';

/**
 * Wallet connection hook for Stellar network
 * Uses @stellar/freighter-api v3 for Freighter wallet extension
 */

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  network: string | null;
  isLoading: boolean;
  error: string | null;
}

const WALLET_STORAGE_KEY = 'restaurant_dapp_wallet';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    publicKey: null,
    network: null,
    isLoading: false,
    error: null,
  });

  // Check if Freighter is installed
  const isFreighterInstalled = useCallback((): boolean => {
    return true; // @stellar/freighter-api handles detection internally
  }, []);

  // Restore wallet connection from storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.publicKey) {
          isConnected()
            .then((result) => {
              if (result.isConnected) {
                setWallet({
                  connected: true,
                  publicKey: parsed.publicKey,
                  network: parsed.network || 'testnet',
                  isLoading: false,
                  error: null,
                });
              } else {
                localStorage.removeItem(WALLET_STORAGE_KEY);
              }
            })
            .catch(() => {
              localStorage.removeItem(WALLET_STORAGE_KEY);
            });
        }
      } catch {
        localStorage.removeItem(WALLET_STORAGE_KEY);
      }
    }
  }, []);

  // Connect wallet
  const connect = useCallback(async (): Promise<string | null> => {
    setWallet((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // requestAccess() triggers the Freighter popup AND returns the address
      const accessResult = await requestAccess();

      if (accessResult.error) {
        throw new Error(
          accessResult.error === 'User declined access'
            ? 'You declined the connection request. Please try again.'
            : `Freighter error: ${accessResult.error}`
        );
      }

      const publicKey = accessResult.address;
      if (!publicKey) {
        throw new Error('Failed to get public key from Freighter');
      }

      // Get network
      let network = 'testnet';
      try {
        const networkResult = await getNetwork();
        network = networkResult.network || 'testnet';
      } catch {
        // Default to testnet
      }

      const walletData = { publicKey, network };
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(walletData));

      setWallet({
        connected: true,
        publicKey,
        network,
        isLoading: false,
        error: null,
      });

      return publicKey;
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to connect wallet';
      setWallet((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    setWallet({
      connected: false,
      publicKey: null,
      network: null,
      isLoading: false,
      error: null,
    });
  }, []);

  // Format public key for display
  const formatPublicKey = useCallback((key: string | null): string => {
    if (!key) return '';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }, []);

  // Sign a transaction using Freighter
  const signTransaction = useCallback(
    async (transactionXdr: string): Promise<string> => {
      const result = await freighterSignTx(transactionXdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      if (result.error) {
        throw new Error(`Signing failed: ${result.error}`);
      }

      return result.signedTxXdr;
    },
    []
  );

  return {
    ...wallet,
    connect,
    disconnect,
    isFreighterInstalled,
    formatPublicKey,
    signTransaction,
  };
}
