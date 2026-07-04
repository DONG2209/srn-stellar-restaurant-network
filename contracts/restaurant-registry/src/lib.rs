#![no_std]

// =====================================================
//  RestaurantRegistry Smart Contract - Stellar Soroban
//  Central registry for the Stellar Restaurant Network.
//  Manages restaurant onboarding, metadata, anchor
//  channel configuration for cross-border payments,
//  and network-wide loyalty program settings.
//  Built for Level 4 - Green Belt Submission.
// =====================================================
//  Features:
//   - Restaurant onboarding with rich metadata
//   - Anchor channel registry (SEP-24/31 configs)
//   - Supported currency pairs per restaurant
//   - Network-wide loyalty token binding
//   - Restaurant rating and verification
//   - Revenue and order analytics per restaurant
//   - Admin-governed with upgradeable params
// =====================================================

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Symbol, Vec, BytesN,
};

// ==================== Data Types ====================

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct GeoLocation {
    pub latitude: i64,   // stored as degrees * 10^6
    pub longitude: i64,  // stored as degrees * 10^6
}

// Input struct for restaurant location data (reduces register_restaurant param count)
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RestaurantLocationInput {
    pub latitude: i64,
    pub longitude: i64,
    pub address_line: String,
    pub city: String,
    pub country: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorConfig {
    pub anchor_name: String,
    pub sep24_url: String,
    pub sep31_url: String,
    pub supported_currencies: Vec<String>, // e.g., ["USDC", "VND", "JPY"]
    pub fee_basis_points: u32,             // anchor fee in bps
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CurrencyPair {
    pub base_currency: String,   // e.g., "USDC"
    pub quote_currency: String,  // e.g., "VND"
    pub exchange_rate: i128,     // stored as quote per base * 10^7, updated by oracle
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RestaurantInfo {
    pub id: u32,
    pub owner: Address,
    pub contract_address: Address,  // the restaurant's own Soroban contract
    pub name: String,
    pub description: String,
    pub cuisine_type: String,       // "Vietnamese", "Japanese", "Thai", "Indonesian"
    pub location: GeoLocation,
    pub address_line: String,       // human-readable address
    pub city: String,
    pub country: String,            // ISO 3166-1 alpha-2
    pub anchor_configs: Vec<AnchorConfig>,
    pub supported_pairs: Vec<CurrencyPair>,
    pub loyalty_token_address: Address,
    pub is_active: bool,
    pub is_verified: bool,
    pub total_orders: u64,
    pub total_revenue: i128,
    pub total_loyalty_issued: i128,
    pub registered_at: u64,
    pub rating: u32,                // 0-500 (0-5 stars * 100)
    pub review_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RegisterRestaurantEvent {
    pub restaurant_id: u32,
    pub owner: Address,
    pub name: String,
    pub country: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorAddedEvent {
    pub restaurant_id: u32,
    pub anchor_name: String,
    pub currencies: Vec<String>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RateUpdatedEvent {
    pub restaurant_id: u32,
    pub new_rating: u32,
    pub review_count: u32,
}

// ==================== Storage Keys ====================

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const RESTAURANTS_KEY: Symbol = symbol_short!("RESTRNT");
const RESTAURANT_COUNT_KEY: Symbol = symbol_short!("REST_CNT");
const OWNER_REGISTRY_KEY: Symbol = symbol_short!("OWNER_REG");
const CURRENCY_PAIRS_KEY: Symbol = symbol_short!("CUR_PAIRS");
const ANCHOR_REGISTRY_KEY: Symbol = symbol_short!("ANCHORS");
const NETWORK_CONFIG_KEY: Symbol = symbol_short!("NET_CFG");

// ==================== Contract ====================

#[contract]
pub struct RestaurantRegistryContract;

#[contractimpl]
impl RestaurantRegistryContract {
    /// Initialize the registry
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("Registry already initialized");
        }

        admin.require_auth();

        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&RESTAURANTS_KEY, &Map::<u32, RestaurantInfo>::new(&env));
        env.storage().instance().set(&RESTAURANT_COUNT_KEY, &0u32);
        env.storage().instance().set(&OWNER_REGISTRY_KEY, &Map::<Address, Vec<u32>>::new(&env));
        env.storage().instance().set(&CURRENCY_PAIRS_KEY, &Map::<(String, String), CurrencyPair>::new(&env));
        env.storage().instance().set(&ANCHOR_REGISTRY_KEY, &Map::<String, Vec<u32>>::new(&env));

        env.events().publish(
            (symbol_short!("reg_init"),),
            (admin,),
        );
    }

    /// Register a new restaurant in the network
    /// This is called by a restaurant owner to onboard their restaurant
    pub fn register_restaurant(
        env: Env,
        owner: Address,
        contract_address: Address,
        name: String,
        description: String,
        cuisine_type: String,
        location: RestaurantLocationInput,
        loyalty_token_address: Address,
    ) -> u32 {
        owner.require_auth();

        let count: u32 = env.storage()
            .instance()
            .get(&RESTAURANT_COUNT_KEY)
            .unwrap_or(0);

        let new_id = count + 1;
        let timestamp = env.ledger().timestamp();

        let info = RestaurantInfo {
            id: new_id,
            owner: owner.clone(),
            contract_address,
            name: name.clone(),
            description,
            cuisine_type: cuisine_type.clone(),
            location: GeoLocation {
                latitude: location.latitude,
                longitude: location.longitude,
            },
            address_line: location.address_line,
            city: location.city.clone(),
            country: location.country.clone(),
            anchor_configs: Vec::new(&env),
            supported_pairs: Vec::new(&env),
            loyalty_token_address,
            is_active: true,
            is_verified: false,
            total_orders: 0,
            total_revenue: 0,
            total_loyalty_issued: 0,
            registered_at: timestamp,
            rating: 0,
            review_count: 0,
        };

        // Store restaurant
        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));
        restaurants.set(new_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
        env.storage().instance().set(&RESTAURANT_COUNT_KEY, &new_id);

        // Track by owner
        let mut owner_registry: Map<Address, Vec<u32>> = env.storage()
            .instance()
            .get(&OWNER_REGISTRY_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut owner_restaurants = owner_registry.get(owner.clone())
            .unwrap_or_else(|| Vec::new(&env));
        owner_restaurants.push_back(new_id);
        owner_registry.set(owner.clone(), owner_restaurants);
        env.storage().instance().set(&OWNER_REGISTRY_KEY, &owner_registry);

        env.events().publish(
            (symbol_short!("reg_rest"),),
            RegisterRestaurantEvent {
                restaurant_id: new_id,
                owner,
                name,
                country: location.country.clone(),
            },
        );

        new_id
    }

    /// Add an anchor configuration for a restaurant (cross-border payments)
    pub fn add_anchor_config(
        env: Env,
        admin: Address,
        restaurant_id: u32,
        anchor_name: String,
        sep24_url: String,
        sep31_url: String,
        supported_currencies: Vec<String>,
        fee_basis_points: u32,
    ) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        let anchor = AnchorConfig {
            anchor_name: anchor_name.clone(),
            sep24_url,
            sep31_url,
            supported_currencies: supported_currencies.clone(),
            fee_basis_points,
        };

        let mut anchors = info.anchor_configs.clone();
        anchors.push_back(anchor);
        info.anchor_configs = anchors.clone();
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);

        // Track which restaurants support which anchors
        let mut anchor_registry: Map<String, Vec<u32>> = env.storage()
            .instance()
            .get(&ANCHOR_REGISTRY_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut restaurants_for_anchor = anchor_registry.get(anchor_name.clone())
            .unwrap_or_else(|| Vec::new(&env));
        restaurants_for_anchor.push_back(restaurant_id);
        anchor_registry.set(anchor_name.clone(), restaurants_for_anchor);
        env.storage().instance().set(&ANCHOR_REGISTRY_KEY, &anchor_registry);

        env.events().publish(
            (symbol_short!("anch_add"),),
            AnchorAddedEvent {
                restaurant_id,
                anchor_name,
                currencies: supported_currencies,
            },
        );
    }

    /// Add supported currency pair for a restaurant
    pub fn add_currency_pair(
        env: Env,
        admin: Address,
        restaurant_id: u32,
        base_currency: String,
        quote_currency: String,
        initial_rate: i128,
    ) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let pair = CurrencyPair {
            base_currency: base_currency.clone(),
            quote_currency: quote_currency.clone(),
            exchange_rate: initial_rate,
            last_updated: env.ledger().timestamp(),
        };

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        let mut pairs = info.supported_pairs.clone();
        pairs.push_back(pair);
        info.supported_pairs = pairs.clone();
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
    }

    /// Update exchange rate for a currency pair
    pub fn update_exchange_rate(
        env: Env,
        oracle: Address,
        restaurant_id: u32,
        base_currency: String,
        quote_currency: String,
        new_rate: i128,
    ) {
        oracle.require_auth();
        // In production, verify oracle is authorized

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        let mut pairs = info.supported_pairs.clone();
        let mut updated = false;

        for i in 0..pairs.len() {
            let pair = pairs.get(i).unwrap();
            if pair.base_currency == base_currency && pair.quote_currency == quote_currency {
                let mut new_pair = pair;
                new_pair.exchange_rate = new_rate;
                new_pair.last_updated = env.ledger().timestamp();
                pairs.set(i, new_pair);
                updated = true;
                break;
            }
        }

        if !updated {
            panic!("Currency pair not found");
        }

        info.supported_pairs = pairs;
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
    }

    /// Verify a restaurant (admin only)
    pub fn verify_restaurant(env: Env, admin: Address, restaurant_id: u32) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));
        info.is_verified = true;
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
    }

    /// Toggle restaurant active status
    pub fn toggle_restaurant_active(env: Env, owner: Address, restaurant_id: u32) {
        owner.require_auth();

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        if info.owner != owner {
            panic!("Only the owner can toggle restaurant status");
        }

        info.is_active = !info.is_active;
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
    }

    /// Update restaurant analytics (called by restaurant contract)
    pub fn update_restaurant_stats(
        env: Env,
        restaurant_contract: Address,
        restaurant_id: u32,
        order_amount: i128,
        loyalty_issued: i128,
    ) {
        // Only the restaurant's contract can update stats
        restaurant_contract.require_auth();

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        if info.contract_address != restaurant_contract {
            panic!("Only the registered contract can update stats");
        }

        info.total_orders = info.total_orders.checked_add(1).unwrap();
        info.total_revenue = info.total_revenue.checked_add(order_amount)
            .unwrap_or_else(|| panic!("Revenue overflow"));
        info.total_loyalty_issued = info.total_loyalty_issued.checked_add(loyalty_issued)
            .unwrap_or_else(|| panic!("Loyalty overflow"));

        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);
    }

    /// Add a review/rating for a restaurant
    pub fn add_review(
        env: Env,
        customer: Address,
        restaurant_id: u32,
        rating: u32,   // 100-500 (1-5 stars * 100)
    ) {
        customer.require_auth();

        if rating < 100 || rating > 500 || rating % 100 != 0 {
            panic!("Rating must be 100, 200, 300, 400, or 500");
        }

        let mut restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));

        // Calculate new average rating
        let current_total = info.rating.checked_mul(info.review_count).unwrap_or(0);
        let new_count = info.review_count.checked_add(1).unwrap();
        let new_total = current_total.checked_add(rating).unwrap();
        let new_rating = new_total.checked_div(new_count).unwrap_or(0);

        info.rating = new_rating;
        info.review_count = new_count;
        restaurants.set(restaurant_id, info);
        env.storage().instance().set(&RESTAURANTS_KEY, &restaurants);

        env.events().publish(
            (symbol_short!("rating"),),
            RateUpdatedEvent {
                restaurant_id,
                new_rating,
                review_count: new_count,
            },
        );
    }

    // ==================== Getters ====================

    /// Get restaurant info by ID
    pub fn get_restaurant(env: Env, restaurant_id: u32) -> RestaurantInfo {
        let restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"))
    }

    /// Get all restaurants
    pub fn get_all_restaurants(env: Env) -> Vec<RestaurantInfo> {
        let restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for (_id, info) in restaurants.iter() {
            result.push_back(info);
        }
        result
    }

    /// Get restaurants by country (for cross-border discovery)
    pub fn get_restaurants_by_country(env: Env, country: String) -> Vec<RestaurantInfo> {
        let restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for (_id, info) in restaurants.iter() {
            if info.country == country && info.is_active {
                result.push_back(info);
            }
        }
        result
    }

    /// Get restaurants by cuisine type
    pub fn get_restaurants_by_cuisine(env: Env, cuisine: String) -> Vec<RestaurantInfo> {
        let restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for (_id, info) in restaurants.iter() {
            if info.cuisine_type == cuisine && info.is_active {
                result.push_back(info);
            }
        }
        result
    }

    /// Get restaurants owned by an address
    pub fn get_owner_restaurants(env: Env, owner: Address) -> Vec<u32> {
        let owner_registry: Map<Address, Vec<u32>> = env.storage()
            .instance()
            .get(&OWNER_REGISTRY_KEY)
            .unwrap_or_else(|| Map::new(&env));

        owner_registry.get(owner)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get total number of registered restaurants
    pub fn get_restaurant_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&RESTAURANT_COUNT_KEY)
            .unwrap_or(0)
    }

    /// Get supported currency pairs for a restaurant
    pub fn get_currency_pairs(env: Env, restaurant_id: u32) -> Vec<CurrencyPair> {
        let restaurants: Map<u32, RestaurantInfo> = env.storage()
            .instance()
            .get(&RESTAURANTS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let info = restaurants.get(restaurant_id)
            .unwrap_or_else(|| panic!("Restaurant not found"));
        info.supported_pairs
    }

    /// Get exchange rate for a currency pair
    pub fn get_exchange_rate(
        env: Env,
        restaurant_id: u32,
        base: String,
        quote: String,
    ) -> i128 {
        let pairs = Self::get_currency_pairs(env, restaurant_id);
        for pair in pairs.iter() {
            if pair.base_currency == base && pair.quote_currency == quote {
                return pair.exchange_rate;
            }
        }
        panic!("Currency pair not supported");
    }

    /// Get the admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN_KEY)
            .unwrap_or_else(|| panic!("Registry not initialized"))
    }

    /// Calculate estimated cross-border payment in quote currency
    pub fn calculate_cross_border_amount(
        env: Env,
        restaurant_id: u32,
        base_currency: String,
        quote_currency: String,
        base_amount: i128,
    ) -> i128 {
        let rate = Self::get_exchange_rate(env, restaurant_id, base_currency, quote_currency);
        // rate is quote per base * 10^7, so divide by 10^7 after multiplication
        base_amount.checked_mul(rate)
            .unwrap_or_else(|| panic!("Calculation overflow"))
            .checked_div(10_000_000)
            .unwrap_or_else(|| panic!("Division error"))
    }

    // ==================== Helpers ====================

    fn ensure_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance()
            .get(&ADMIN_KEY)
            .unwrap_or_else(|| panic!("Registry not initialized"));
        if admin != *caller {
            panic!("Caller is not the admin");
        }
    }
}

#[cfg(test)]
mod test;
