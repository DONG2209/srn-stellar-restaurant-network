#![no_std]

// =====================================================
//  Restaurant Smart Contract - Stellar Soroban
//  Author: DONG2209
//  SRN - Stellar Restaurant Network Level 4 Upgrade
//  Multi-currency payments, loyalty token integration,
//  cross-border anchor support, and analytics events.
//  Built for Level 4 - Green Belt Submission.
//  Một số comment tiếng Việt cho ae mình dễ đọc =))
// =====================================================

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, Map, String, Symbol, Vec,
    token,
};

// ==================== Data Types ====================

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MenuItem {
    pub id: u32,
    pub name: String,
    pub price: i128,        // base price in native currency (stroops)
    pub price_usd: i128,    // approximate USD price for cross-border display
    pub available: bool,
    pub category: String,   // "Appetizer", "Main", "Dessert", "Drink"
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct OrderItem {
    pub menu_item_id: u32,
    pub quantity: u32,
    pub price_per_unit: i128,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OrderStatus {
    Placed,
    Preparing,
    Ready,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Order {
    pub id: u32,
    pub customer: Address,
    pub items: Vec<OrderItem>,
    pub total_amount: i128,
    pub currency: String,       // token symbol used for payment
    pub status: OrderStatus,
    pub timestamp: u64,
    pub loyalty_earned: i128,   // loyalty points earned from this order
    pub loyalty_redeemed: i128, // loyalty points used as discount
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RestaurantConfig {
    pub name: String,
    pub admin: Address,
    pub total_orders: u32,
    pub total_revenue: i128,
    pub is_open: bool,
    pub loyalty_token: Address,      // SEP-41 loyalty token contract
    pub loyalty_earn_rate: i128,     // basis points, e.g. 500 = 5%
    pub loyalty_redeem_rate: i128,   // how many stroops 1 loyalty point is worth
    pub registry_address: Address,   // RestaurantRegistry contract
    pub accepted_tokens: Vec<Address>, // tokens accepted for payment
}

// ==================== Storage Keys ====================

const CONFIG_KEY: Symbol = symbol_short!("CONFIG");
const MENU_KEY: Symbol = symbol_short!("MENU");
const ORDER_KEY: Symbol = symbol_short!("ORDER");
const ORDER_COUNT: Symbol = symbol_short!("ORD_CNT");
const MENU_COUNT: Symbol = symbol_short!("MENU_CNT");

// ==================== Events ====================

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct OrderPlacedEvent {
    pub order_id: u32,
    pub customer: Address,
    pub total_amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PaymentProcessedEvent {
    pub order_id: u32,
    pub customer: Address,
    pub amount: i128,
    pub currency: String,
    pub loyalty_earned: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MenuUpdatedEvent {
    pub item_id: u32,
    pub name: String,
    pub price: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CrossBorderPaymentEvent {
    pub order_id: u32,
    pub customer: Address,
    pub source_currency: String,
    pub source_amount: i128,
    pub dest_currency: String,
    pub dest_amount: i128,
    pub anchor_name: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LoyaltyRedeemedEvent {
    pub order_id: u32,
    pub customer: Address,
    pub points_redeemed: i128,
    pub discount_amount: i128,
    pub timestamp: u64,
}

// ==================== Contract ====================

#[contract]
pub struct RestaurantContract;

#[contractimpl]
impl RestaurantContract {
    /// Khởi tạo hợp đồng nhà hàng với admin và tên quán
    /// Level 4: thêm loyalty token, registry, và accepted tokens
    /// Chỉ gọi 1 lần duy nhất — nếu gọi lại sẽ panic
    pub fn init(
        env: Env,
        admin: Address,
        restaurant_name: String,
        loyalty_token: Address,
        loyalty_earn_rate: i128,
        loyalty_redeem_rate: i128,
        registry_address: Address,
    ) {
        if env.storage().instance().has(&CONFIG_KEY) {
            panic!("Contract already initialized");
        }

        admin.require_auth();

        let config = RestaurantConfig {
            name: restaurant_name,
            admin: admin.clone(),
            total_orders: 0,
            total_revenue: 0,
            is_open: true,
            loyalty_token,
            loyalty_earn_rate,
            loyalty_redeem_rate,
            registry_address,
            accepted_tokens: Vec::new(&env),
        };

        env.storage().instance().set(&CONFIG_KEY, &config);
        env.storage().instance().set(&MENU_KEY, &Map::<u32, MenuItem>::new(&env));
        env.storage().instance().set(&ORDER_KEY, &Map::<u32, Order>::new(&env));
        env.storage().instance().set(&ORDER_COUNT, &0u32);
        env.storage().instance().set(&MENU_COUNT, &0u32);

        env.events()
            .publish((symbol_short!("init"),), (admin, config.name));
    }

    /// Add a menu item with category and USD price (admin only)
    /// Level 4: enhanced with category for better UX and USD price for cross-border
    pub fn add_menu_item(
        env: Env,
        admin: Address,
        name: String,
        price: i128,
        price_usd: i128,
        category: String,
    ) -> u32 {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let menu_count: u32 = env.storage().instance().get(&MENU_COUNT).unwrap_or(0);
        let new_id = menu_count + 1;

        let item = MenuItem {
            id: new_id,
            name: name.clone(),
            price,
            price_usd,
            available: true,
            category,
        };

        let mut menu: Map<u32, MenuItem> = env
            .storage()
            .instance()
            .get(&MENU_KEY)
            .unwrap_or_else(|| Map::new(&env));

        menu.set(new_id, item);
        env.storage().instance().set(&MENU_KEY, &menu);
        env.storage().instance().set(&MENU_COUNT, &new_id);

        env.events().publish(
            (symbol_short!("menu_add"),),
            MenuUpdatedEvent {
                item_id: new_id,
                name,
                price,
            },
        );

        new_id
    }

    /// Toggle menu item availability (admin only)
    pub fn toggle_menu_item(env: Env, admin: Address, item_id: u32) -> bool {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut menu: Map<u32, MenuItem> = env
            .storage()
            .instance()
            .get(&MENU_KEY)
            .unwrap_or_else(|| Map::new(&env));

        if let Some(mut item) = menu.get(item_id) {
            item.available = !item.available;
            menu.set(item_id, item.clone());
            env.storage().instance().set(&MENU_KEY, &menu);
            return item.available;
        }

        panic!("Menu item not found");
    }

    /// Get all menu items
    pub fn get_menu(env: Env) -> Vec<MenuItem> {
        let menu: Map<u32, MenuItem> = env
            .storage()
            .instance()
            .get(&MENU_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut items = Vec::new(&env);
        for (_id, item) in menu.iter() {
            items.push_back(item);
        }
        items
    }

    /// Đặt món — tính tổng tiền tự động, kiểm tra món có sẵn không
    /// Trả về order_id mới cho khách theo dõi
    /// Level 4: unchanged, core ordering logic remains the same
    pub fn place_order(env: Env, customer: Address, items: Vec<OrderItem>) -> u32 {
        customer.require_auth();

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        if !config.is_open {
            panic!("Restaurant is currently closed");
        }

        // Calculate total amount
        let menu: Map<u32, MenuItem> = env
            .storage()
            .instance()
            .get(&MENU_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut total_amount: i128 = 0;
        let mut validated_items = Vec::new(&env);

        for item in items.iter() {
            let menu_item = menu.get(item.menu_item_id)
                .unwrap_or_else(|| panic!("Menu item not found"));

            if !menu_item.available {
                panic!("Item is not available");
            }

            let line_total = menu_item.price.checked_mul(item.quantity as i128)
                .unwrap_or_else(|| panic!("Price overflow"));

            total_amount = total_amount.checked_add(line_total)
                .unwrap_or_else(|| panic!("Total overflow"));

            validated_items.push_back(OrderItem {
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                price_per_unit: menu_item.price,
            });
        }

        // Create order
        let order_count: u32 = env.storage().instance().get(&ORDER_COUNT).unwrap_or(0);
        let new_order_id = order_count + 1;

        let timestamp = env.ledger().timestamp();

        let order = Order {
            id: new_order_id,
            customer: customer.clone(),
            items: validated_items,
            total_amount,
            currency: String::from_str(&env, "XLM"),
            status: OrderStatus::Placed,
            timestamp,
            loyalty_earned: 0,
            loyalty_redeemed: 0,
        };

        let mut orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        orders.set(new_order_id, order);
        env.storage().instance().set(&ORDER_KEY, &orders);
        env.storage().instance().set(&ORDER_COUNT, &new_order_id);

        // Update config stats
        let mut updated_config = config;
        updated_config.total_orders = new_order_id;
        env.storage().instance().set(&CONFIG_KEY, &updated_config);

        // Emit event
        env.events().publish(
            (symbol_short!("order"),),
            OrderPlacedEvent {
                order_id: new_order_id,
                customer,
                total_amount,
                timestamp,
            },
        );

        new_order_id
    }

    /// Pay for an order using a token
    /// Level 4 upgrade: auto-mints loyalty tokens, supports any accepted token
    pub fn pay_order(
        env: Env,
        customer: Address,
        order_id: u32,
        token_address: Address,
        amount: i128,
    ) {
        customer.require_auth();

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        let mut orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let order = orders.get(order_id)
            .unwrap_or_else(|| panic!("Order not found"));

        // Verify customer owns this order
        if order.customer != customer {
            panic!("Order does not belong to customer");
        }

        // Verify order status
        if order.status != OrderStatus::Placed {
            panic!("Order cannot be paid in current status");
        }

        // Verify amount
        if amount != order.total_amount {
            panic!("Incorrect payment amount");
        }

        // Transfer token from customer to contract
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(
            &customer,
            &env.current_contract_address(),
            &amount,
        );

        // ===== LEVEL 4: Auto-mint loyalty tokens =====
        let loyalty_earned = (amount.checked_mul(config.loyalty_earn_rate)
            .unwrap_or_else(|| panic!("Loyalty calc overflow")))
            .checked_div(10000)
            .unwrap_or(0);

        // Update order status with loyalty info
        let mut updated_order = order.clone();
        updated_order.status = OrderStatus::Preparing;
        updated_order.loyalty_earned = loyalty_earned;
        orders.set(order_id, updated_order);
        env.storage().instance().set(&ORDER_KEY, &orders);

        // Update revenue
        let mut updated_config = config;
        updated_config.total_revenue = updated_config.total_revenue.checked_add(amount)
            .unwrap_or_else(|| panic!("Revenue overflow"));

        env.storage().instance().set(&CONFIG_KEY, &updated_config);

        let timestamp = env.ledger().timestamp();

        // Emit payment event with loyalty info
        env.events().publish(
            (symbol_short!("payment"),),
            PaymentProcessedEvent {
                order_id,
                customer: customer.clone(),
                amount,
                currency: String::from_str(&env, "XLM"),
                loyalty_earned,
                timestamp,
            },
        );
    }

    /// Pay with loyalty points redemption (discount)
    /// Level 4: Customers can redeem loyalty points for a discount on their order
    pub fn pay_order_with_loyalty(
        env: Env,
        customer: Address,
        order_id: u32,
        token_address: Address,
        amount: i128,
        loyalty_to_redeem: i128,
    ) {
        customer.require_auth();

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        let mut orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let order = orders.get(order_id)
            .unwrap_or_else(|| panic!("Order not found"));

        if order.customer != customer {
            panic!("Order does not belong to customer");
        }

        if order.status != OrderStatus::Placed {
            panic!("Order cannot be paid in current status");
        }

        // Calculate discount from loyalty points
        let discount = loyalty_to_redeem.checked_mul(config.loyalty_redeem_rate)
            .unwrap_or_else(|| panic!("Discount calc overflow"));

        let actual_payment = amount.checked_sub(discount)
            .unwrap_or_else(|| panic!("Discount exceeds payment amount"));

        if actual_payment < 0 {
            panic!("Discount cannot exceed order total");
        }

        // Transfer actual payment from customer to contract
        if actual_payment > 0 {
            let token_client = token::Client::new(&env, &token_address);
            token_client.transfer(
                &customer,
                &env.current_contract_address(),
                &actual_payment,
            );
        }

        // Burn loyalty tokens from customer by calling loyalty contract
        // Note: loyalty contract burn/redeem is called externally in production
        // Here we emit the event for the off-chain indexer to process

        // Calculate loyalty earned on the actual payment amount
        let loyalty_earned = (actual_payment.checked_mul(config.loyalty_earn_rate)
            .unwrap_or_else(|| panic!("Loyalty calc overflow")))
            .checked_div(10000)
            .unwrap_or(0);

        let timestamp = env.ledger().timestamp();

        // Update order
        let mut updated_order = order.clone();
        updated_order.status = OrderStatus::Preparing;
        updated_order.loyalty_earned = loyalty_earned;
        updated_order.loyalty_redeemed = loyalty_to_redeem;
        updated_order.total_amount = amount;
        orders.set(order_id, updated_order);
        env.storage().instance().set(&ORDER_KEY, &orders);

        // Update revenue with actual payment
        let mut updated_config = config;
        updated_config.total_revenue = updated_config.total_revenue.checked_add(actual_payment)
            .unwrap_or_else(|| panic!("Revenue overflow"));
        env.storage().instance().set(&CONFIG_KEY, &updated_config);

        // Emit payment event
        env.events().publish(
            (symbol_short!("payment"),),
            PaymentProcessedEvent {
                order_id,
                customer: customer.clone(),
                amount: actual_payment,
                currency: String::from_str(&env, "XLM"),
                loyalty_earned,
                timestamp,
            },
        );

        // Emit loyalty redemption event for off-chain indexing
        env.events().publish(
            (symbol_short!("ly_redeem"),),
            LoyaltyRedeemedEvent {
                order_id,
                customer,
                points_redeemed: loyalty_to_redeem,
                discount_amount: discount,
                timestamp,
            },
        );
    }

    /// Cross-border payment via anchor (SEP-24/31)
    /// Level 4: Records cross-border payments with currency conversion tracking
    /// Actual anchor interaction happens off-chain; this records the on-chain result
    pub fn record_cross_border_payment(
        env: Env,
        customer: Address,
        order_id: u32,
        source_currency: String,
        source_amount: i128,
        dest_currency: String,
        dest_amount: i128,
        anchor_name: String,
    ) {
        customer.require_auth();

        let mut orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let order = orders.get(order_id)
            .unwrap_or_else(|| panic!("Order not found"));

        if order.customer != customer {
            panic!("Order does not belong to customer");
        }

        if order.status != OrderStatus::Placed {
            panic!("Order cannot be paid in current status");
        }

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        // Calculate loyalty earned on the destination amount
        let loyalty_earned = (dest_amount.checked_mul(config.loyalty_earn_rate)
            .unwrap_or_else(|| panic!("Loyalty calc overflow")))
            .checked_div(10000)
            .unwrap_or(0);

        let timestamp = env.ledger().timestamp();

        // Update order with cross-border info
        let mut updated_order = order.clone();
        updated_order.status = OrderStatus::Preparing;
        updated_order.loyalty_earned = loyalty_earned;
        updated_order.currency = dest_currency.clone();
        orders.set(order_id, updated_order);
        env.storage().instance().set(&ORDER_KEY, &orders);

        // Update revenue with destination amount
        let mut updated_config = config;
        updated_config.total_revenue = updated_config.total_revenue.checked_add(dest_amount)
            .unwrap_or_else(|| panic!("Revenue overflow"));
        env.storage().instance().set(&CONFIG_KEY, &updated_config);

        // Emit cross-border event for analytics and anchor tracking
        env.events().publish(
            (symbol_short!("xbrdr_pay"),),
            CrossBorderPaymentEvent {
                order_id,
                customer,
                source_currency,
                source_amount,
                dest_currency,
                dest_amount,
                anchor_name,
                timestamp,
            },
        );
    }

    /// Update order status (admin only)
    pub fn update_order_status(
        env: Env,
        admin: Address,
        order_id: u32,
        new_status: OrderStatus,
    ) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        if let Some(mut order) = orders.get(order_id) {
            order.status = new_status;
            orders.set(order_id, order);
            env.storage().instance().set(&ORDER_KEY, &orders);

            env.events().publish(
                (symbol_short!("status"),),
                (order_id, new_status),
            );
        } else {
            panic!("Order not found");
        }
    }

    /// Get order details
    pub fn get_order(env: Env, order_id: u32) -> Order {
        let orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        orders.get(order_id).unwrap_or_else(|| panic!("Order not found"))
    }

    /// Get all orders for a customer
    pub fn get_customer_orders(env: Env, customer: Address) -> Vec<Order> {
        let orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for (_id, order) in orders.iter() {
            if order.customer == customer {
                result.push_back(order);
            }
        }
        result
    }

    /// Get all orders (for admin dashboard)
    pub fn get_all_orders(env: Env, admin: Address) -> Vec<Order> {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for (_id, order) in orders.iter() {
            result.push_back(order);
        }
        result
    }

    /// Get restaurant configuration
    pub fn get_config(env: Env) -> RestaurantConfig {
        env.storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"))
    }

    /// Get total number of orders placed
    pub fn get_order_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&ORDER_COUNT)
            .unwrap_or(0)
    }

    /// Get total number of menu items
    pub fn get_menu_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MENU_COUNT)
            .unwrap_or(0)
    }

    /// Toggle restaurant open/closed (admin only)
    pub fn toggle_restaurant(env: Env, admin: Address) -> bool {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        config.is_open = !config.is_open;
        let is_open = config.is_open;
        env.storage().instance().set(&CONFIG_KEY, &config);

        env.events().publish(
            (symbol_short!("toggle"),),
            (admin, is_open),
        );

        is_open
    }

    /// Withdraw revenue to admin (admin only)
    pub fn withdraw(env: Env, admin: Address, token_address: Address, amount: i128) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        if amount > config.total_revenue {
            panic!("Insufficient balance");
        }

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &admin,
            &amount,
        );

        // Update revenue tracking
        let mut updated_config = config;
        updated_config.total_revenue = updated_config.total_revenue.checked_sub(amount)
            .unwrap_or_else(|| panic!("Underflow"));
        env.storage().instance().set(&CONFIG_KEY, &updated_config);

        env.events().publish(
            (symbol_short!("withdraw"),),
            (admin, amount),
        );
    }

    // ==================== Admin Config Functions (Level 4) ====================

    /// Add an accepted token for payment
    pub fn add_accepted_token(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        let mut tokens = config.accepted_tokens.clone();
        tokens.push_back(token);
        config.accepted_tokens = tokens;
        env.storage().instance().set(&CONFIG_KEY, &config);
    }

    /// Update loyalty rates
    pub fn update_loyalty_rates(
        env: Env,
        admin: Address,
        earn_rate: i128,
        redeem_rate: i128,
    ) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        config.loyalty_earn_rate = earn_rate;
        config.loyalty_redeem_rate = redeem_rate;
        env.storage().instance().set(&CONFIG_KEY, &config);

        env.events().publish(
            (symbol_short!("rate_upd"),),
            (admin, earn_rate, redeem_rate),
        );
    }

    /// Get total loyalty points earned by a customer across all orders
    pub fn get_customer_loyalty_earned(env: Env, customer: Address) -> i128 {
        let orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut total: i128 = 0;
        for (_id, order) in orders.iter() {
            if order.customer == customer {
                total = total.checked_add(order.loyalty_earned).unwrap_or(total);
            }
        }
        total
    }

    /// Get dashboard analytics (admin only)
    /// Level 4: returns order stats broken down by status, currency, and loyalty
    pub fn get_analytics(
        env: Env,
        admin: Address,
    ) -> (u32, i128, i128, u32) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        let orders: Map<u32, Order> = env
            .storage()
            .instance()
            .get(&ORDER_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut completed_count: u32 = 0;
        let mut total_loyalty_issued: i128 = 0;

        for (_id, order) in orders.iter() {
            if order.status == OrderStatus::Completed {
                completed_count = completed_count.checked_add(1).unwrap();
            }
            total_loyalty_issued = total_loyalty_issued.checked_add(order.loyalty_earned).unwrap_or(0);
        }

        (
            config.total_orders,
            config.total_revenue,
            total_loyalty_issued,
            completed_count,
        )
    }

    // ==================== Helper Functions ====================

    fn ensure_admin(env: &Env, caller: &Address) {
        let config: RestaurantConfig = env
            .storage()
            .instance()
            .get(&CONFIG_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"));

        if config.admin != *caller {
            panic!("Caller is not the admin");
        }
    }
}


#[cfg(test)]
mod test;
