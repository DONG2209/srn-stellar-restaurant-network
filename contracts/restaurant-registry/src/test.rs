#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

fn make_location(env: &Env, lat: i64, lng: i64, addr: &str, city: &str, country: &str) -> RestaurantLocationInput {
    RestaurantLocationInput {
        latitude: lat,
        longitude: lng,
        address_line: String::from_str(env, addr),
        city: String::from_str(env, city),
        country: String::from_str(env, country),
    }
}

#[test]
fn test_registry_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    assert_eq!(contract.get_admin(), admin);
    assert_eq!(contract.get_restaurant_count(), 0);
}

#[test]
#[should_panic(expected = "Registry already initialized")]
fn test_double_init_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);
    contract.init(&admin);
}

#[test]
fn test_register_restaurant() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty_token = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 21_028_500, 105_854_200, "15 Hang Bac, Hoan Kiem", "Hanoi", "VN");
    let id = contract.register_restaurant(
        &owner,
        &restaurant_contract,
        &String::from_str(&env, "Pho Ha Noi"),
        &String::from_str(&env, "Authentic Vietnamese pho in Hanoi Old Quarter"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty_token,
    );

    assert_eq!(id, 1);
    assert_eq!(contract.get_restaurant_count(), 1);

    let info = contract.get_restaurant(&1);
    assert_eq!(info.name, String::from_str(&env, "Pho Ha Noi"));
    assert_eq!(info.country, String::from_str(&env, "VN"));
    assert_eq!(info.owner, owner);
    assert!(info.is_active);
    assert!(!info.is_verified);
}

#[test]
fn test_get_restaurants_by_country() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let contract1 = Address::generate(&env);
    let contract2 = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let registry_id = env.register(RestaurantRegistryContract, ());
    let registry = RestaurantRegistryContractClient::new(&env, &registry_id);

    registry.init(&admin);

    let loc1 = make_location(&env, 21_028_500, 105_854_200, "Hanoi", "Hanoi", "VN");
    registry.register_restaurant(
        &owner1, &contract1,
        &String::from_str(&env, "Pho Ha Noi"),
        &String::from_str(&env, "Vietnamese pho"),
        &String::from_str(&env, "Vietnamese"),
        &loc1,
        &loyalty,
    );

    let loc2 = make_location(&env, 35_676_200, 139_650_300, "Shibuya", "Tokyo", "JP");
    registry.register_restaurant(
        &owner2, &contract2,
        &String::from_str(&env, "Sushi Tokyo"),
        &String::from_str(&env, "Authentic sushi"),
        &String::from_str(&env, "Japanese"),
        &loc2,
        &loyalty,
    );

    let vn = registry.get_restaurants_by_country(&String::from_str(&env, "VN"));
    assert_eq!(vn.len(), 1);
    assert_eq!(vn.get(0).unwrap().name, String::from_str(&env, "Pho Ha Noi"));

    let jp = registry.get_restaurants_by_country(&String::from_str(&env, "JP"));
    assert_eq!(jp.len(), 1);
    assert_eq!(jp.get(0).unwrap().name, String::from_str(&env, "Sushi Tokyo"));
}

#[test]
fn test_verify_restaurant() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "Addr", "City", "VN");
    contract.register_restaurant(
        &owner, &restaurant_contract,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty,
    );

    assert!(!contract.get_restaurant(&1).is_verified);

    contract.verify_restaurant(&admin, &1);
    assert!(contract.get_restaurant(&1).is_verified);
}

#[test]
fn test_add_review() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let customer = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "Addr", "City", "VN");
    contract.register_restaurant(
        &owner, &restaurant_contract,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty,
    );

    // First review: 5 stars
    contract.add_review(&customer, &1, &500);
    let info = contract.get_restaurant(&1);
    assert_eq!(info.rating, 500);
    assert_eq!(info.review_count, 1);
}

#[test]
fn test_toggle_restaurant() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "Addr", "City", "VN");
    contract.register_restaurant(
        &owner, &restaurant_contract,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty,
    );

    assert!(contract.get_restaurant(&1).is_active);

    contract.toggle_restaurant_active(&owner, &1);
    assert!(!contract.get_restaurant(&1).is_active);

    contract.toggle_restaurant_active(&owner, &1);
    assert!(contract.get_restaurant(&1).is_active);
}

#[test]
fn test_add_currency_pair() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "Addr", "City", "VN");
    contract.register_restaurant(
        &owner, &restaurant_contract,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty,
    );

    // Add USDC->VND pair (1 USDC = 25400 VND, stored as 25400 * 10^7)
    contract.add_currency_pair(
        &admin, &1,
        &String::from_str(&env, "USDC"),
        &String::from_str(&env, "VND"),
        &254_000_000_000i128,
    );

    let rate = contract.get_exchange_rate(
        &1,
        &String::from_str(&env, "USDC"),
        &String::from_str(&env, "VND"),
    );
    assert_eq!(rate, 254_000_000_000i128);
}

#[test]
fn test_update_restaurant_stats() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let restaurant_contract = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "Addr", "City", "VN");
    contract.register_restaurant(
        &owner, &restaurant_contract,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Vietnamese"),
        &loc,
        &loyalty,
    );

    contract.update_restaurant_stats(&restaurant_contract, &1, &1000, &50);

    let info = contract.get_restaurant(&1);
    assert_eq!(info.total_orders, 1);
    assert_eq!(info.total_revenue, 1000);
    assert_eq!(info.total_loyalty_issued, 50);
}

#[test]
fn test_owner_restaurants() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let c1 = Address::generate(&env);
    let c2 = Address::generate(&env);
    let loyalty = Address::generate(&env);

    let contract_id = env.register(RestaurantRegistryContract, ());
    let contract = RestaurantRegistryContractClient::new(&env, &contract_id);

    contract.init(&admin);

    let loc = make_location(&env, 0, 0, "A1", "C1", "VN");
    contract.register_restaurant(
        &owner, &c1,
        &String::from_str(&env, "R1"), &String::from_str(&env, "D1"),
        &String::from_str(&env, "Vietnamese"),
        &loc, &loyalty,
    );
    contract.register_restaurant(
        &owner, &c2,
        &String::from_str(&env, "R2"), &String::from_str(&env, "D2"),
        &String::from_str(&env, "Vietnamese"),
        &loc, &loyalty,
    );

    let owned = contract.get_owner_restaurants(&owner);
    assert_eq!(owned.len(), 2);
}
