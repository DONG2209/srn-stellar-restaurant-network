#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _};
use soroban_sdk::{Address, Env, String};

fn setup<'a>() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(
        &admin,
        &String::from_str(&env, "SRN Loyalty Points"),
        &String::from_str(&env, "SRNP"),
        &100,
    );

    contract.add_minter(&admin, &restaurant);

    (env, admin, restaurant)
}

#[test]
fn test_token_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "SRN Loyalty Points"), &String::from_str(&env, "SRNP"), &100);

    assert_eq!(contract.name(), String::from_str(&env, "SRN Loyalty Points"));
    assert_eq!(contract.symbol(), String::from_str(&env, "SRNP"));
    assert_eq!(contract.decimals(), 7);
    assert_eq!(contract.total_supply(), 0);
    assert_eq!(contract.get_admin(), admin);
    assert_eq!(contract.get_earn_rate(), 100);
}

#[test]
#[should_panic(expected = "Token already initialized")]
fn test_double_init_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "First"), &String::from_str(&env, "FST"), &100);
    // Double init should panic
    contract.init(&admin, &String::from_str(&env, "Second"), &String::from_str(&env, "SND"), &100);
}

#[test]
fn test_mint_unauthorized_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let customer = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);

    // Try mint without authorization
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.mint(&unauthorized, &customer, &100, &1, &String::from_str(&env, "test"));
    }));
    assert!(result.is_err());
}

#[test]
fn test_balance_after_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let customer = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);

    assert_eq!(contract.balance(&customer), 0);
    assert_eq!(contract.total_supply(), 0);

    contract.mint(&restaurant, &customer, &1000, &1, &String::from_str(&env, "Payment at Pho Ha Noi"));
    assert_eq!(contract.balance(&customer), 1000);
    assert_eq!(contract.total_supply(), 1000);
}

#[test]
fn test_redeem_loyalty_points() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let customer = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);

    contract.mint(&restaurant, &customer, &500, &1, &String::from_str(&env, "earn"));
    assert_eq!(contract.balance(&customer), 500);

    contract.redeem(&customer, &restaurant, &200, &1, &50);
    assert_eq!(contract.balance(&customer), 300);
    assert_eq!(contract.total_supply(), 300);
}

#[test]
#[should_panic(expected = "Insufficient loyalty points")]
fn test_redeem_insufficient_balance_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let customer = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);

    contract.mint(&restaurant, &customer, &100, &1, &String::from_str(&env, "earn"));
    contract.redeem(&customer, &restaurant, &200, &1, &50);
}

#[test]
fn test_transfer_loyalty_points() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);

    contract.mint(&restaurant, &alice, &1000, &1, &String::from_str(&env, "earn"));
    contract.transfer(&alice, &bob, &300);

    assert_eq!(contract.balance(&alice), 700);
    assert_eq!(contract.balance(&bob), 300);
    assert_eq!(contract.total_supply(), 1000);
}

#[test]
fn test_calculate_earn() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &500);

    let earned = contract.calculate_earn(&10000);
    assert_eq!(earned, 500);
}

#[test]
fn test_only_admin_can_add_minter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let new_minter = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.add_minter(&non_admin, &new_minter);
    }));
    assert!(result.is_err());
}

#[test]
fn test_remove_minter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let customer = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);

    contract.mint(&restaurant, &customer, &100, &1, &String::from_str(&env, "test"));

    contract.remove_minter(&admin, &restaurant);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.mint(&restaurant, &customer, &100, &1, &String::from_str(&env, "test"));
    }));
    assert!(result.is_err());
}

#[test]
fn test_approve_and_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let contract_id = env.register(LoyaltyTokenContract, ());
    let contract = LoyaltyTokenContractClient::new(&env, &contract_id);

    contract.init(&admin, &String::from_str(&env, "Test"), &String::from_str(&env, "TST"), &100);
    contract.add_minter(&admin, &restaurant);
    contract.mint(&restaurant, &alice, &1000, &1, &String::from_str(&env, "earn"));

    contract.approve(&alice, &bob, &400, &u32::MAX);
    contract.transfer_from(&bob, &alice, &charlie, &150);

    assert_eq!(contract.balance(&alice), 850);
    assert_eq!(contract.balance(&charlie), 150);
    assert_eq!(contract.allowance(&alice, &bob), 250);
}
