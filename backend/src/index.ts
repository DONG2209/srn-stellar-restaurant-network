// =====================================================
//  SRN Backend Service - Stellar Restaurant Network
//  Anchor integration (SEP-24/31), DEX path finding,
//  event indexing, and analytics API.
//  Built for Level 4 - Green Belt Submission.
// =====================================================

import { Server, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

// ==================== Types ====================

interface AnchorConfig {
  name: string;
  sep24Url: string;
  sep31Url: string;
  supportedCurrencies: string[];
  feeBasisPoints: number;
  endpoint: string;
}

interface CurrencyPair {
  baseCurrency: string;
  quoteCurrency: string;
  exchangeRate: number;
  lastUpdated: number;
}

interface CrossBorderQuote {
  sourceCurrency: string;
  sourceAmount: number;
  destCurrency: string;
  destAmount: number;
  exchangeRate: number;
  anchorFee: number;
  estimatedSettlement: number; // seconds
}

interface RestaurantAnalytics {
  restaurantId: number;
  totalOrders: number;
  totalRevenue: number;
  totalLoyaltyIssued: number;
  completedOrders: number;
  averageOrderValue: number;
  topSellingItems: { name: string; count: number }[];
  revenueByCurrency: { currency: string; amount: number }[];
  dailyOrders: { date: string; count: number; revenue: number }[];
}

// ==================== Anchor Configuration ====================

const ANCHOR_REGISTRY: Map<string, AnchorConfig> = new Map([
  ['vnd_anchor', {
    name: 'VND Anchor',
    sep24Url: 'https://anchor.vnd.stellar.org/sep24',
    sep31Url: 'https://anchor.vnd.stellar.org/sep31',
    supportedCurrencies: ['USDC', 'VND'],
    feeBasisPoints: 50, // 0.5%
    endpoint: 'https://anchor.vnd.stellar.org'
  }],
  ['jpy_anchor', {
    name: 'JPY Anchor',
    sep24Url: 'https://anchor.jpy.stellar.org/sep24',
    sep31Url: 'https://anchor.jpy.stellar.org/sep31',
    supportedCurrencies: ['USDC', 'JPY'],
    feeBasisPoints: 30, // 0.3%
    endpoint: 'https://anchor.jpy.stellar.org'
  }],
  ['thb_anchor', {
    name: 'THB Anchor',
    sep24Url: 'https://anchor.thb.stellar.org/sep24',
    sep31Url: 'https://anchor.thb.stellar.org/sep31',
    supportedCurrencies: ['USDC', 'THB'],
    feeBasisPoints: 60, // 0.6%
    endpoint: 'https://anchor.thb.stellar.org'
  }],
  ['idr_anchor', {
    name: 'IDR Anchor',
    sep24Url: 'https://anchor.idr.stellar.org/sep24',
    sep31Url: 'https://anchor.idr.stellar.org/sep31',
    supportedCurrencies: ['USDC', 'IDR'],
    feeBasisPoints: 55, // 0.55%
    endpoint: 'https://anchor.idr.stellar.org'
  }],
]);

// ==================== Exchange Rates (Mock Oracle) ====================

// Rates stored as quote per USDC * 10^7
const EXCHANGE_RATES: Map<string, number> = new Map([
  ['USDC:VND', 254_000_000_000], // 1 USDC = 25,400 VND
  ['USDC:JPY', 1_500_000_000],   // 1 USDC = 150 JPY
  ['USDC:THB', 350_000_000],     // 1 USDC = 35 THB
  ['USDC:IDR', 160_000_000_000], // 1 USDC = 16,000 IDR
  ['USDC:USDC', 10_000_000],     // 1 USDC = 1 USDC
]);

// ==================== Stellar Network Config ====================

const STELLAR_RPC = 'https://soroban-testnet.stellar.org';
const STELLAR_PASSPHRASE = 'Test SDF Network ; September 2015';

// ==================== SEP-24 Interactive Flow ====================

/**
 * Initiate a SEP-24 interactive deposit for cross-border payment.
 * Customer deposits fiat -> anchor issues stablecoin on Stellar.
 */
async function initiateSep24Deposit(
  anchor: AnchorConfig,
  assetCode: string,
  amount: number,
  customerAccount: string,
  memo?: string
): Promise<{ interactiveUrl: string; depositId: string }> {
  // Build the SEP-24 interactive URL
  const params = new URLSearchParams({
    asset_code: assetCode,
    account: customerAccount,
    amount: amount.toString(),
    lang: 'en',
    ...(memo ? { memo, memo_type: 'text' } : {}),
  });

  const interactiveUrl = `${anchor.sep24Url}/interactive/deposit?${params.toString()}`;

  console.log(`[SEP-24] Initiating deposit via ${anchor.name}`);
  console.log(`[SEP-24] Customer: ${customerAccount}, Amount: ${amount} ${assetCode}`);
  console.log(`[SEP-24] Interactive URL: ${interactiveUrl}`);

  // In production, this would call the anchor's SEP-24 endpoint
  // and return the interactive URL for the customer to complete KYC/deposit
  // For now, return the constructed URL
  return {
    interactiveUrl,
    depositId: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
  };
}

/**
 * Initiate a SEP-31 cross-border payment (for receiving fiat).
 * Used when a restaurant receives payment in local currency.
 */
async function initiateSep31Payment(
  anchor: AnchorConfig,
  senderAccount: string,
  receiverAccount: string,
  amount: number,
  sourceAsset: string,
  destAsset: string
): Promise<{ paymentId: string; estimatedFee: number; exchangeRate: number }> {
  const rateKey = `${sourceAsset}:${destAsset}`;
  const exchangeRate = EXCHANGE_RATES.get(rateKey) || 10_000_000;
  const feeBps = anchor.feeBasisPoints;
  const fee = Math.floor(amount * feeBps / 10000);

  console.log(`[SEP-31] Cross-border payment: ${amount} ${sourceAsset} -> ${destAsset}`);
  console.log(`[SEP-31] Exchange rate: ${exchangeRate} (×10^7)`);
  console.log(`[SEP-31] Anchor fee: ${fee} (${feeBps} bps)`);

  // In production, this calls the anchor's SEP-31 endpoint
  return {
    paymentId: `sep31_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    estimatedFee: fee,
    exchangeRate,
  };
}

// ==================== DEX Path Finding ====================

interface DEXPath {
  path: string[];       // asset sequence through the DEX
  sourceAmount: number;
  destAmount: number;
  rate: number;
  slippage: number;    // basis points
}

/**
 * Find the best DEX path for a currency pair.
 * Uses Stellar's path payment strict receive semantics.
 */
async function findBestDEXPath(
  sourceAsset: string,
  destAsset: string,
  sourceAmount: number,
  maxSlippage: number = 100 // 1% default
): Promise<DEXPath | null> {
  console.log(`[DEX] Finding path: ${sourceAmount} ${sourceAsset} -> ${destAsset}`);

  // Direct pair check
  const directKey = `${sourceAsset}:${destAsset}`;
  const directRate = EXCHANGE_RATES.get(directKey);

  if (directRate) {
    const destAmount = Math.floor((sourceAmount * directRate) / 10_000_000);
    return {
      path: [sourceAsset, destAsset],
      sourceAmount,
      destAmount,
      rate: directRate,
      slippage: 30, // 0.3% on direct pairs
    };
  }

  // Try via USDC as intermediate (most common path)
  const toUsdcKey = `${sourceAsset}:USDC`;
  const fromUsdcKey = `USDC:${destAsset}`;

  const toUsdcRate = EXCHANGE_RATES.get(toUsdcKey);
  const fromUsdcRate = EXCHANGE_RATES.get(fromUsdcKey);

  if (toUsdcRate && fromUsdcRate) {
    const usdcAmount = Math.floor((sourceAmount * toUsdcRate) / 10_000_000);
    const destAmount = Math.floor((usdcAmount * fromUsdcRate) / 10_000_000);

    return {
      path: [sourceAsset, 'USDC', destAsset],
      sourceAmount,
      destAmount,
      rate: Math.floor((toUsdcRate * fromUsdcRate) / 10_000_000),
      slippage: 60, // 0.6% on two-hop paths
    };
  }

  console.log(`[DEX] No path found for ${sourceAsset} -> ${destAsset}`);
  return null;
}

// ==================== Cross-Border Quote ====================

/**
 * Get a quote for a cross-border payment.
 * A tourist paying in JPY at a Vietnamese restaurant, for example.
 */
async function getCrossBorderQuote(
  sourceCurrency: string,
  sourceAmount: number,
  destCurrency: string,
  anchorName: string
): Promise<CrossBorderQuote | null> {
  const anchor = ANCHOR_REGISTRY.get(anchorName);
  if (!anchor) {
    console.log(`[Quote] Anchor ${anchorName} not found`);
    return null;
  }

  const path = await findBestDEXPath(sourceCurrency, destCurrency, sourceAmount);
  if (!path) {
    console.log(`[Quote] No DEX path for ${sourceCurrency} -> ${destCurrency}`);
    return null;
  }

  const anchorFee = Math.floor(path.destAmount * anchor.feeBasisPoints / 10000);
  const finalAmount = path.destAmount - anchorFee;

  return {
    sourceCurrency,
    sourceAmount,
    destCurrency,
    destAmount: finalAmount,
    exchangeRate: path.rate,
    anchorFee,
    estimatedSettlement: 10, // ~10 seconds on Stellar
  };
}

// ==================== Analytics Service ====================

/**
 * In-memory analytics store.
 * In production, this would use a database with event indexing.
 */
class AnalyticsService {
  private orderEvents: Map<number, any[]> = new Map();
  private paymentEvents: Map<number, any[]> = new Map();
  private dailyStats: Map<string, { count: number; revenue: number }> = new Map();
  private itemSales: Map<string, number> = new Map();

  recordOrder(restaurantId: number, order: any) {
    const events = this.orderEvents.get(restaurantId) || [];
    events.push({ ...order, timestamp: Date.now() });
    this.orderEvents.set(restaurantId, events);

    // Track daily stats
    const today = new Date().toISOString().split('T')[0];
    const stats = this.dailyStats.get(today) || { count: 0, revenue: 0 };
    stats.count++;
    stats.revenue += order.totalAmount || 0;
    this.dailyStats.set(today, stats);
  }

  recordPayment(restaurantId: number, payment: any) {
    const events = this.paymentEvents.get(restaurantId) || [];
    events.push({ ...payment, timestamp: Date.now() });
    this.paymentEvents.set(restaurantId, events);

    // Track item sales
    if (payment.items) {
      for (const item of payment.items) {
        const name = item.name || `Item ${item.menuItemId}`;
        const current = this.itemSales.get(name) || 0;
        this.itemSales.set(name, current + (item.quantity || 1));
      }
    }
  }

  getAnalytics(restaurantId: number): RestaurantAnalytics {
    const orders = this.orderEvents.get(restaurantId) || [];
    const payments = this.paymentEvents.get(restaurantId) || [];

    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalLoyalty = payments.reduce((sum, p) => sum + (p.loyaltyEarned || 0), 0);
    const avgOrder = orders.length > 0 ? totalRevenue / orders.length : 0;

    const revenueByCurrency = new Map<string, number>();
    for (const p of payments) {
      const curr = p.currency || 'XLM';
      revenueByCurrency.set(curr, (revenueByCurrency.get(curr) || 0) + p.amount);
    }

    const sortedItems = Array.from(this.itemSales.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sortedDaily = Array.from(this.dailyStats.entries())
      .map(([date, stats]) => ({ date, count: stats.count, revenue: stats.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      restaurantId,
      totalOrders: orders.length,
      totalRevenue,
      totalLoyaltyIssued: totalLoyalty,
      completedOrders: orders.filter(o => o.status === 'Completed').length,
      averageOrderValue: Math.round(avgOrder),
      topSellingItems: sortedItems,
      revenueByCurrency: Array.from(revenueByCurrency.entries()).map(([currency, amount]) => ({
        currency,
        amount,
      })),
      dailyOrders: sortedDaily,
    };
  }
}

const analytics = new AnalyticsService();

// ==================== Event Indexer ====================

/**
 * Indexes on-chain events from the Restaurant and LoyaltyToken contracts.
 * Runs as a background service, polling Stellar RPC for new events.
 */
class EventIndexer {
  private lastLedger: number = 0;
  private contractIds: string[] = [];
  private polling: boolean = false;
  private intervalMs: number = 5000; // poll every 5 seconds

  constructor(contractIds: string[]) {
    this.contractIds = contractIds;
  }

  async start() {
    console.log('[Indexer] Starting event indexer...');
    console.log(`[Indexer] Watching contracts: ${this.contractIds.join(', ')}`);

    this.polling = true;
    while (this.polling) {
      await this.pollEvents();
      await new Promise(resolve => setTimeout(resolve, this.intervalMs));
    }
  }

  stop() {
    this.polling = false;
    console.log('[Indexer] Stopped');
  }

  private async pollEvents() {
    try {
      // In production, this calls Stellar RPC getEvents()
      // For MVP, we use simulated event processing
      const response = await fetch(`${STELLAR_RPC}/getEvents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'getEvents',
          params: {
            startLedger: this.lastLedger,
            filters: this.contractIds.map(contractId => ({
              type: 'contract',
              contractIds: [contractId],
              topics: [['*']],
            })),
            pagination: { limit: 100 },
          },
        }),
      });

      if (!response.ok) {
        // RPC might not be available; skip this poll
        console.log(`[Indexer] RPC unavailable (status ${response.status}), will retry`);
        return;
      }

      const data = await response.json();
      if (data.result?.events) {
        for (const event of data.result.events) {
          this.processEvent(event);
        }
        this.lastLedger = data.result.latestLedger || this.lastLedger;
      }
    } catch (err) {
      // RPC might not be available in dev; suppress error
      console.log(`[Indexer] Poll failed: ${(err as Error).message}`);
    }
  }

  private processEvent(event: any) {
    const topic = event.topic?.[0];
    const data = event.data;

    switch (topic) {
      case 'order':
        console.log(`[Indexer] New order: ${data.order_id} by ${data.customer}`);
        break;
      case 'payment':
        console.log(`[Indexer] Payment: ${data.amount} with ${data.loyalty_earned} loyalty pts`);
        analytics.recordPayment(1, {
          orderId: data.order_id,
          customer: data.customer,
          amount: data.amount,
          currency: data.currency || 'XLM',
          loyaltyEarned: data.loyalty_earned,
        });
        break;
      case 'loyalty_earn':
        console.log(`[Indexer] Loyalty earned: ${data.customer} +${data.amount} pts`);
        break;
      case 'loyalty_redeem':
        console.log(`[Indexer] Loyalty redeemed: ${data.customer} -${data.amount} pts`);
        break;
      case 'xborder_pay':
        console.log(`[Indexer] Cross-border: ${data.source_currency} -> ${data.dest_currency}`);
        analytics.recordPayment(1, {
          orderId: data.order_id,
          customer: data.customer,
          amount: data.dest_amount,
          currency: data.dest_currency,
          loyaltyEarned: 0,
          crossBorder: true,
          sourceCurrency: data.source_currency,
          anchorName: data.anchor_name,
        });
        break;
      default:
        // Unknown event, skip
        break;
    }
  }
}

// ==================== HTTP API Server ====================

/**
 * Simple HTTP API server for the frontend to query.
 * Provides anchor quotes, analytics, and DEX path endpoints.
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const parsedUrl = parse(req.url || '/', true);
  const path = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // GET /api/health
    if (path === '/api/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        service: 'SRN Backend',
        version: '1.0.0',
        timestamp: Date.now(),
      }));
      return;
    }

    // GET /api/quote?source=JPY&amount=1000&dest=VND&anchor=jpy_anchor
    if (path === '/api/quote') {
      const sourceCurrency = (query.source as string) || 'USDC';
      const sourceAmount = parseInt((query.amount as string) || '1000');
      const destCurrency = (query.dest as string) || 'VND';
      const anchorName = (query.anchor as string) || 'vnd_anchor';

      const quote = await getCrossBorderQuote(
        sourceCurrency,
        sourceAmount,
        destCurrency,
        anchorName
      );

      if (!quote) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'No quote available for this currency pair' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(quote));
      return;
    }

    // GET /api/anchors
    if (path === '/api/anchors') {
      const anchors = Array.from(ANCHOR_REGISTRY.entries()).map(([id, config]) => ({
        id,
        name: config.name,
        supportedCurrencies: config.supportedCurrencies,
        feeBasisPoints: config.feeBasisPoints,
      }));

      res.writeHead(200);
      res.end(JSON.stringify(anchors));
      return;
    }

    // GET /api/dex-path?source=JPY&dest=VND&amount=1000
    if (path === '/api/dex-path') {
      const sourceAsset = (query.source as string) || 'USDC';
      const destAsset = (query.dest as string) || 'VND';
      const amount = parseInt((query.amount as string) || '1000');

      const path = await findBestDEXPath(sourceAsset, destAsset, amount);

      if (!path) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'No DEX path found' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(path));
      return;
    }

    // GET /api/analytics?restaurantId=1
    if (path === '/api/analytics') {
      const restaurantId = parseInt((query.restaurantId as string) || '1');
      const stats = analytics.getAnalytics(restaurantId);

      res.writeHead(200);
      res.end(JSON.stringify(stats));
      return;
    }

    // GET /api/exchange-rates
    if (path === '/api/exchange-rates') {
      const rates = Array.from(EXCHANGE_RATES.entries()).map(([pair, rate]) => {
        const [base, quote] = pair.split(':');
        return { base, quote, rate };
      });

      res.writeHead(200);
      res.end(JSON.stringify(rates));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (err) {
    console.error(`[API] Error handling ${req.method} ${path}:`, err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// ==================== Main ====================

const PORT = parseInt(process.env.PORT || '3001');
const CONTRACT_IDS = process.env.CONTRACT_IDS?.split(',') || [
  'CCVH3EHZJPER3ISZO3U2VEPMVVQW3XTPKECVC7DFIPOFT6E4P46TMQAY', // Level 3 Restaurant
];

export async function startBackend() {
  console.log('========================================');
  console.log('  SRN Backend - Stellar Restaurant Net  ');
  console.log('  Level 4 - Green Belt Submission       ');
  console.log('========================================');
  console.log(`  Port: ${PORT}`);
  console.log(`  Stellar RPC: ${STELLAR_RPC}`);
  console.log(`  Watching: ${CONTRACT_IDS.length} contracts`);
  console.log(`  Anchors: ${ANCHOR_REGISTRY.size} configured`);
  console.log('========================================\n');

  // Start event indexer
  const indexer = new EventIndexer(CONTRACT_IDS);
  indexer.start().catch(err => console.log('[Indexer] Background error:', err));

  // Start HTTP server
  const server = require('http').createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] Endpoints:`);
    console.log(`  GET /api/health`);
    console.log(`  GET /api/quote?source=&amount=&dest=&anchor=`);
    console.log(`  GET /api/anchors`);
    console.log(`  GET /api/dex-path?source=&dest=&amount=`);
    console.log(`  GET /api/analytics?restaurantId=1`);
    console.log(`  GET /api/exchange-rates`);
  });

  return { server, indexer };
}

// Auto-start when run directly
if (require.main === module) {
  startBackend().catch(console.error);
}

export {
  initiateSep24Deposit,
  initiateSep31Payment,
  findBestDEXPath,
  getCrossBorderQuote,
  AnalyticsService,
  EventIndexer,
  ANCHOR_REGISTRY,
  EXCHANGE_RATES,
  STELLAR_RPC,
  STELLAR_PASSPHRASE,
};
