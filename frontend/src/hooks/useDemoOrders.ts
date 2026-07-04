import { useState, useCallback } from 'react';
import type { Order, OrderItem, OrderStatus, MenuItem } from '../utils/contract';

const DEMO_ORDERS_KEY = 'restaurant_dapp_demo_orders';

interface DemoOrder extends Order {
  demoOrderId: number;
  itemDetails: Array<{ name: string; price: number }>;
  createdAt: string;
}

function loadOrders(): DemoOrder[] {
  try {
    const raw = localStorage.getItem(DEMO_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrders(orders: DemoOrder[]): void {
  localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders));
}

export function useDemoOrders(publicKey: string | null) {
  const [orders, setOrders] = useState<DemoOrder[]>(loadOrders);
  const [refreshKey, setRefreshKey] = useState(0);

  const placeDemoOrder = useCallback(
    (items: Array<{ item: MenuItem; quantity: number }>) => {
      const now = new Date();
      const orderId = Date.now();

      const orderItems: OrderItem[] = items.map(({ item, quantity }) => ({
        menu_item_id: item.id,
        quantity,
        price_per_unit: item.price,
      }));

      const totalAmount = items.reduce(
        (sum, { item, quantity }) => sum + Number(item.price) * quantity,
        0
      );

      const itemDetails = items.map(({ item, quantity }) => ({
        name: item.name,
        price: item.price,
        quantity,
      }));

      const newOrder: DemoOrder = {
        demoOrderId: orderId,
        id: orderId % 100000,
        customer: publicKey || 'G-DEMO-USER',
        items: orderItems,
        total_amount: totalAmount,
        status: 'Placed',
        timestamp: Math.floor(now.getTime() / 1000),
        itemDetails,
        createdAt: now.toISOString(),
      };

      const updated = [newOrder, ...loadOrders()];
      saveOrders(updated);
      setOrders(updated);
      setRefreshKey((k) => k + 1);

      // Auto-update status: Placed → Preparing (1.5s) → Ready (3s)
      setTimeout(() => {
        const current = loadOrders().map((o) =>
          o.demoOrderId === orderId ? { ...o, status: 'Preparing' as OrderStatus } : o
        );
        saveOrders(current);
        setOrders(current);
        setRefreshKey((k) => k + 1);
      }, 1500);

      setTimeout(() => {
        const current = loadOrders().map((o) =>
          o.demoOrderId === orderId ? { ...o, status: 'Ready' as OrderStatus } : o
        );
        saveOrders(current);
        setOrders(current);
        setRefreshKey((k) => k + 1);
      }, 3000);

      return orderId;
    },
    [publicKey]
  );

  const clearAllOrders = useCallback(() => {
    saveOrders([]);
    setOrders([]);
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    demoOrders: orders,
    placeDemoOrder,
    clearAllOrders,
    refreshKey,
  };
}
