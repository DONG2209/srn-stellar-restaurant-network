// =====================================================
//  Analytics & Monitoring - SRN Level 4
//  Usage tracking, error monitoring, and performance
//  metrics for the Stellar Restaurant Network.
//  Integrates with Vercel Analytics + custom backend.
// =====================================================

// ==================== Types ====================

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: number;
}

interface ErrorReport {
  message: string;
  stack?: string;
  component?: string;
  walletAddress?: string;
  timestamp: number;
}

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  timestamp: number;
}

// ==================== Analytics Service ====================

class AnalyticsService {
  private events: AnalyticsEvent[] = [];
  private errors: ErrorReport[] = [];
  private metrics: PerformanceMetric[] = [];
  private enabled: boolean = true;
  private endpoint: string = '/api/analytics';
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupPageTracking();
    this.setupErrorTracking();
  }

  /** Track a named event with optional properties */
  track(name: string, properties?: Record<string, string | number | boolean>) {
    if (!this.enabled) return;

    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: Date.now(),
    };

    this.events.push(event);

    // Keep only last 1000 events in memory
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log(`[Analytics] ${name}`, properties || '');
    }

    // Send to backend (debounced/batched in production)
    this.flushIfNeeded();
  }

  /** Track a page view */
  pageView(path: string) {
    this.track('page_view', { path, referrer: document.referrer });
  }

  /** Track wallet connection */
  walletConnected(address: string, network: string) {
    this.track('wallet_connected', {
      addressPrefix: address.slice(0, 8),
      network,
    });
  }

  /** Track order placed */
  orderPlaced(orderId: number, itemCount: number, totalAmount: number, currency?: string) {
    this.track('order_placed', {
      orderId,
      itemCount,
      totalAmount,
      currency: currency || 'XLM',
    });
  }

  /** Track loyalty earned */
  loyaltyEarned(amount: number, restaurantId?: number) {
    this.track('loyalty_earned', {
      amount,
      restaurantId: restaurantId || 0,
    });
  }

  /** Track cross-border payment */
  crossBorderPayment(
    sourceCurrency: string,
    destCurrency: string,
    amount: number,
    anchorName: string
  ) {
    this.track('cross_border_payment', {
      sourceCurrency,
      destCurrency,
      amount,
      anchorName,
    });
  }

  /** Report an error */
  reportError(error: Error, component?: string, walletAddress?: string) {
    const report: ErrorReport = {
      message: error.message,
      stack: error.stack,
      component,
      walletAddress,
      timestamp: Date.now(),
    };

    this.errors.push(report);

    // Always log errors
    console.error(`[Error] ${component || 'App'}:`, error.message);

    // In production, send to Sentry or backend
    if (!import.meta.env.DEV && this.enabled) {
      this.sendErrorReport(report);
    }
  }

  /** Record a performance metric */
  recordMetric(name: string, value: number, unit: 'ms' | 'bytes' | 'count' = 'ms') {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
    };
    this.metrics.push(metric);

    if (import.meta.env.DEV) {
      console.log(`[Perf] ${name}: ${value}${unit}`);
    }
  }

  /** Measure execution time of a function */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, Math.round(duration), 'ms');
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, Math.round(duration), 'ms');
      throw error;
    }
  }

  /** Get analytics summary */
  getSummary() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;

    const recentEvents = this.events.filter(e => e.timestamp > last24h);
    const eventCounts: Record<string, number> = {};
    for (const e of recentEvents) {
      eventCounts[e.name] = (eventCounts[e.name] || 0) + 1;
    }

    return {
      sessionId: this.sessionId,
      totalEvents: this.events.length,
      totalErrors: this.errors.length,
      recentEventCounts: eventCounts,
      averageMetrics: this.getAverageMetrics(),
    };
  }

  /** Disable analytics (for privacy) */
  disable() {
    this.enabled = false;
  }

  /** Enable analytics */
  enable() {
    this.enabled = true;
  }

  // ==================== Private Methods ====================

  private generateSessionId(): string {
    return `srn_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private setupPageTracking() {
    // Track initial page view
    if (typeof window !== 'undefined') {
      this.pageView(window.location.pathname);

      // Track SPA navigation
      const originalPushState = history.pushState;
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.pageView(window.location.pathname);
      };
    }
  }

  private setupErrorTracking() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.reportError(
          event.error || new Error(event.message),
          'GlobalErrorHandler'
        );
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.reportError(
          new Error(event.reason?.message || 'Unhandled Promise Rejection'),
          'PromiseRejection'
        );
      });
    }
  }

  private flushIfNeeded() {
    // Batch-send events every 30 seconds in production
    if (!this.enabled || import.meta.env.DEV) return;

    // In production, batch-send to backend
    // This would queue events and flush periodically
  }

  private async sendErrorReport(report: ErrorReport) {
    try {
      await fetch(this.endpoint + '/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch {
      // Silently fail — don't cause error loops
    }
  }

  private getAverageMetrics(): Record<string, { avg: number; count: number }> {
    const grouped: Record<string, number[]> = {};
    for (const m of this.metrics) {
      if (!grouped[m.name]) grouped[m.name] = [];
      grouped[m.name].push(m.value);
    }

    const result: Record<string, { avg: number; count: number }> = {};
    for (const [name, values] of Object.entries(grouped)) {
      result[name] = {
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }
    return result;
  }
}

// ==================== Singleton ====================

let analyticsInstance: AnalyticsService | null = null;

export function getAnalytics(): AnalyticsService {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsService();
  }
  return analyticsInstance;
}

// ==================== React Hook ====================

export function useAnalytics() {
  return getAnalytics();
}
