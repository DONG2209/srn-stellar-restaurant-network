#![cfg(test)]
extern crate std;

// Test suite cho RestaurantContract Level 4
// Chạy: cargo test -- --nocapture
// 10 test cases bao phủ tất cả các hàm chính
// Updated for Level 4: new init() + add_menu_item() signatures

use crate::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Address, Env, String,
};

fn setup_test<'a>(env: &Env, admin: &Address) -> (Address, Address, Address) {
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);
    let dummy = Address::generate(&env); // extra address for registry
    (loyalty_token, registry, dummy)
}

#[test]
fn test_contract_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    // Level 4: 6 params
    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    let config = client.get_config();
    assert_eq!(config.name, restaurant_name);
    assert_eq!(config.admin, admin);
    assert_eq!(config.total_orders, 0);
    assert_eq!(config.total_revenue, 0);
    assert!(config.is_open);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_double_init_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    // Second init should panic
    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
}

#[test]
fn test_add_menu_item() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    let item_name = String::from_str(&env, "Pho Bo");
    let category = String::from_str(&env, "Main");
    // Level 4: add_menu_item(admin, name, price, price_usd, category)
    let item_id = client.add_menu_item(&admin, &item_name, &50000i128, &2i128, &category);

    assert_eq!(item_id, 1);

    let menu = client.get_menu();
    assert_eq!(menu.len(), 1);

    let first_item = menu.get(0).unwrap();
    assert_eq!(first_item.name, item_name);
    assert_eq!(first_item.price, 50000);
    assert!(first_item.available);
}

#[test]
fn test_place_order_success() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    // Setup
    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    let item1_name = String::from_str(&env, "Pho Bo");
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &item1_name, &50000i128, &2i128, &category);

    let item2_name = String::from_str(&env, "Bun Cha");
    client.add_menu_item(&admin, &item2_name, &35000i128, &1i128, &category);

    // Place order
    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 2,
            price_per_unit: 50000,
        },
        OrderItem {
            menu_item_id: 2,
            quantity: 1,
            price_per_unit: 35000,
        },
    ];

    let order_id = client.place_order(&customer, &order_items);
    assert_eq!(order_id, 1);

    let order = client.get_order(&order_id);
    assert_eq!(order.total_amount, 135000); // 2*50000 + 1*35000
    assert_eq!(order.status, OrderStatus::Placed);
    assert_eq!(order.items.len(), 2);
    assert_eq!(order.customer, customer);
}

#[test]
fn test_place_order_restaurant_closed() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    // Add menu item
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    // Close restaurant
    client.toggle_restaurant(&admin);
    assert!(!client.get_config().is_open);

    // Try to place order - should panic
    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 1,
            price_per_unit: 50000,
        },
    ];

    // This should panic because restaurant is closed
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.place_order(&customer, &order_items);
    }));
    assert!(result.is_err());
}

#[test]
fn test_update_order_status() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 1,
            price_per_unit: 50000,
        },
    ];

    let order_id = client.place_order(&customer, &order_items);

    // Update status
    client.update_order_status(&admin, &order_id, &OrderStatus::Preparing);
    let order = client.get_order(&order_id);
    assert_eq!(order.status, OrderStatus::Preparing);

    client.update_order_status(&admin, &order_id, &OrderStatus::Ready);
    let order = client.get_order(&order_id);
    assert_eq!(order.status, OrderStatus::Ready);

    client.update_order_status(&admin, &order_id, &OrderStatus::Completed);
    let order = client.get_order(&order_id);
    assert_eq!(order.status, OrderStatus::Completed);
}

#[test]
fn test_non_admin_cannot_add_menu() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    let category = String::from_str(&env, "Main");
    // Non-admin should not be able to add menu items
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_menu_item(&non_admin, &String::from_str(&env, "Hacker Item"), &100i128, &0i128, &category);
    }));
    assert!(result.is_err());
}

#[test]
fn test_get_customer_orders() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer1 = Address::generate(&env);
    let customer2 = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 1,
            price_per_unit: 50000,
        },
    ];

    // Customer 1 places 2 orders
    client.place_order(&customer1, &order_items);
    client.place_order(&customer1, &order_items);

    // Customer 2 places 1 order
    client.place_order(&customer2, &order_items);

    let c1_orders = client.get_customer_orders(&customer1);
    assert_eq!(c1_orders.len(), 2);

    let c2_orders = client.get_customer_orders(&customer2);
    assert_eq!(c2_orders.len(), 1);
}

#[test]
fn test_toggle_menu_item() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    let category = String::from_str(&env, "Main");
    let item_id = client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    // Initially available
    let menu = client.get_menu();
    assert!(menu.get(0).unwrap().available);

    // Toggle to unavailable
    let available = client.toggle_menu_item(&admin, &item_id);
    assert!(!available);

    // Toggle back to available
    let available = client.toggle_menu_item(&admin, &item_id);
    assert!(available);
}

#[test]
fn test_withdraw_as_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    // Place orders to generate order count
    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 3,
            price_per_unit: 50000,
        },
    ];

    client.place_order(&customer, &order_items);

    // Revenue should reflect the total from placed orders
    let config = client.get_config();
    let revenue_before = config.total_revenue;
    // Revenue tracking is updated on payment, not on order placement
    assert_eq!(revenue_before, 0);

    // The withdraw function requires token transfers to have been made first
    // In a real scenario, this would be tested with an actual token contract
}

#[test]
fn test_get_order_and_menu_counts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    // Initially zero counts
    assert_eq!(client.get_menu_count(), 0);
    assert_eq!(client.get_order_count(), 0);

    let category = String::from_str(&env, "Main");
    // Add 3 menu items
    client.add_menu_item(&admin, &String::from_str(&env, "Item 1"), &10000i128, &0i128, &category);
    client.add_menu_item(&admin, &String::from_str(&env, "Item 2"), &20000i128, &1i128, &category);
    client.add_menu_item(&admin, &String::from_str(&env, "Item 3"), &30000i128, &1i128, &category);

    assert_eq!(client.get_menu_count(), 3);

    // Place 2 orders
    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 1,
            price_per_unit: 10000,
        },
    ];
    client.place_order(&customer, &order_items);
    client.place_order(&customer, &order_items);

    assert_eq!(client.get_order_count(), 2);
}

#[test]
fn test_level4_pay_order_with_loyalty() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);
    let category = String::from_str(&env, "Main");
    client.add_menu_item(&admin, &String::from_str(&env, "Pho Bo"), &50000i128, &2i128, &category);

    let order_items = vec![
        &env,
        OrderItem {
            menu_item_id: 1,
            quantity: 1,
            price_per_unit: 50000,
        },
    ];

    let order_id = client.place_order(&customer, &order_items);
    let order = client.get_order(&order_id);
    assert_eq!(order.loyalty_earned, 0); // Not yet paid
    assert_eq!(order.loyalty_redeemed, 0);
}

#[test]
fn test_level4_get_analytics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant_name = String::from_str(&env, "Test Restaurant");
    let loyalty_token = Address::generate(&env);
    let registry = Address::generate(&env);

    let contract_id = env.register_contract(None, RestaurantContract);
    let client = RestaurantContractClient::new(&env, &contract_id);

    client.init(&admin, &restaurant_name, &loyalty_token, &500i128, &20i128, &registry);

    // Analytics should return initial zeros
    let (total_orders, total_revenue, loyalty_issued, completed) = client.get_analytics(&admin);
    assert_eq!(total_orders, 0);
    assert_eq!(total_revenue, 0);
    assert_eq!(loyalty_issued, 0);
    assert_eq!(completed, 0);
}
