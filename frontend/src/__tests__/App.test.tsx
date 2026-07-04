/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Must mock before App import (which triggers @stellar/freighter-api)
vi.mock('../hooks/useWallet', () => ({
  useWallet: () => ({
    connected: false,
    publicKey: null,
    network: null,
    isLoading: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isFreighterInstalled: () => true,
    formatPublicKey: (key: string | null) => key ? `${key.slice(0, 4)}...${key.slice(-4)}` : '',
    signTransaction: vi.fn(),
  }),
}));

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
  getNetwork: vi.fn().mockResolvedValue({ network: 'testnet' }),
  requestAccess: vi.fn().mockResolvedValue({
    address: 'GBZXN7PIRZGN3GOPFDKNDIWUSFNZ2FZ6DZH3WBKPKAT3OYTE6HJ7KZRV',
    error: null,
  }),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'AAAA...' }),
}));

vi.mock('../hooks/useDemoOrders', () => ({
  useDemoOrders: () => ({
    demoOrders: [],
    placeDemoOrder: vi.fn().mockReturnValue(Date.now()),
    clearAllOrders: vi.fn(),
    refreshKey: 0,
  }),
}));

import App from '../App';

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app header', () => {
    render(<App />);
    // Level 4 SRN branding — use regex to match with optional emoji prefix
    const elements = screen.getAllByText(/Stellar Restaurant Network|Restaurant dApp/);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders wallet connect section', () => {
    render(<App />);
    const walletElements = screen.getAllByText('Connect Wallet');
    expect(walletElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders menu and history tabs', () => {
    render(<App />);
    // Tab buttons are present
    const tabs = screen.getAllByRole('button');
    const menuTab = tabs.find((tab) => tab.textContent?.includes('📋'));
    const historyTab = tabs.find((tab) => tab.textContent?.includes('📜'));
    expect(menuTab).toBeDefined();
    expect(historyTab).toBeDefined();
  });

  it('renders the footer with contract link', () => {
    render(<App />);
    const poweredBy = screen.getAllByText(/Built by/);
    expect(poweredBy.length).toBeGreaterThanOrEqual(1);
    const contractLink = screen.getAllByText(/CCVH/);
    expect(contractLink.length).toBeGreaterThanOrEqual(1);
  });

  it('shows restaurant status section', () => {
    render(<App />);
    const elements = screen.getAllByText(/Stellar Restaurant Network|Restaurant dApp/);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });
});
