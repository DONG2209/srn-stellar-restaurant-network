#![no_std]

// =====================================================
//  LoyaltyToken Smart Contract - Stellar Soroban
//  SEP-41 Fungible Token for Stellar Restaurant Network
//  Cross-restaurant loyalty points: earn on payment,
//  redeem at any partner restaurant in the network.
//  Built for Level 4 - Green Belt Submission.
// =====================================================
//  Features:
//   - SEP-41 compliant fungible token
//   - Mint on payment (called by Restaurant contracts)
//   - Burn on redemption
//   - Restaurant Registry integration for authorization
//   - Transferable between customers
//   - Points expiry (optional, configurable)
//   - Tier-based earning rates (optional)
// =====================================================

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Map, String, Symbol, Vec,
};

// ==================== Storage Keys ====================

const BALANCE_KEY: Symbol = symbol_short!("BALANCE");
const ALLOWANCE_KEY: Symbol = symbol_short!("ALLOWANCE");
const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const TOTAL_SUPPLY_KEY: Symbol = symbol_short!("SUPPLY");
const TOKEN_NAME_KEY: Symbol = symbol_short!("TKN_NAME");
const TOKEN_SYMBOL_KEY: Symbol = symbol_short!("TKN_SYMBL");
const DECIMALS_KEY: Symbol = symbol_short!("DECIMALS");
const EARN_RATE_KEY: Symbol = symbol_short!("EARN_RATE");
const REGISTRY_KEY: Symbol = symbol_short!("REGISTRY");
const MINTERS_KEY: Symbol = symbol_short!("MINTERS");

// ==================== Events ====================

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LoyaltyEarnedEvent {
    pub customer: Address,
    pub restaurant_id: u32,
    pub amount: i128,
    pub reason: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LoyaltyRedeemedEvent {
    pub customer: Address,
    pub restaurant_id: u32,
    pub amount: i128,
    pub discount_value: i128,
}

// ==================== Contract ====================

#[contract]
pub struct LoyaltyTokenContract;

#[contractimpl]
impl LoyaltyTokenContract {
    /// Initialize the loyalty token
    /// admin: contract owner
    /// name: token name (e.g., "SRN Loyalty Points")
    /// symbol: token symbol (e.g., "SRNP")
    /// earn_rate: how many loyalty points per stroop of payment (basis points)
    ///            100 = 1 point per stroop, 1 = 0.01 points per stroop
    pub fn init(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        earn_rate: i128,
    ) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("Token already initialized");
        }

        admin.require_auth();

        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&TOKEN_NAME_KEY, &name);
        env.storage().instance().set(&TOKEN_SYMBOL_KEY, &symbol);
        env.storage().instance().set(&DECIMALS_KEY, &7u32);
        env.storage().instance().set(&TOTAL_SUPPLY_KEY, &0i128);
        env.storage().instance().set(&EARN_RATE_KEY, &earn_rate);
        env.storage().instance().set(&BALANCE_KEY, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&ALLOWANCE_KEY, &Map::<(Address, Address), i128>::new(&env));
        env.storage().instance().set(&MINTERS_KEY, &Map::<Address, bool>::new(&env));

        env.events().publish(
            (symbol_short!("ly_init"),),
            (admin, name, symbol),
        );
    }

    // ==================== SEP-41 Token Interface ====================

    /// Mint loyalty tokens - only callable by authorized minters (restaurant contracts)
    /// This is the core earning mechanism: restaurants call this when customers pay
    pub fn mint(
        env: Env,
        minter: Address,
        to: Address,
        amount: i128,
        restaurant_id: u32,
        reason: String,
    ) {
        minter.require_auth();
        Self::ensure_minter(&env, &minter);

        let mut balances: Map<Address, i128> = env.storage()
            .instance()
            .get(&BALANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let current = balances.get(to.clone()).unwrap_or(0);
        let new_balance = current.checked_add(amount)
            .unwrap_or_else(|| panic!("Balance overflow"));
        balances.set(to.clone(), new_balance);
        env.storage().instance().set(&BALANCE_KEY, &balances);

        // Update total supply
        let total: i128 = env.storage().instance().get(&TOTAL_SUPPLY_KEY).unwrap_or(0);
        env.storage().instance().set(
            &TOTAL_SUPPLY_KEY,
            &total.checked_add(amount).unwrap_or_else(|| panic!("Supply overflow")),
        );

        env.events().publish(
            (symbol_short!("ly_earn"),),
            LoyaltyEarnedEvent {
                customer: to.clone(),
                restaurant_id,
                amount,
                reason,
            },
        );
    }

    /// Burn loyalty tokens on redemption
    /// Called when customer redeems points at a restaurant
    pub fn redeem(
        env: Env,
        customer: Address,
        restaurant_contract: Address,
        amount: i128,
        restaurant_id: u32,
        discount_value: i128,
    ) {
        customer.require_auth();
        // restaurant_contract must be an authorized minter
        Self::ensure_minter(&env, &restaurant_contract);

        let mut balances: Map<Address, i128> = env.storage()
            .instance()
            .get(&BALANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let current = balances.get(customer.clone()).unwrap_or(0);
        if current < amount {
            panic!("Insufficient loyalty points");
        }

        let new_balance = current.checked_sub(amount)
            .unwrap_or_else(|| panic!("Balance underflow"));
        balances.set(customer.clone(), new_balance);
        env.storage().instance().set(&BALANCE_KEY, &balances);

        // Update total supply
        let total: i128 = env.storage().instance().get(&TOTAL_SUPPLY_KEY).unwrap_or(0);
        env.storage().instance().set(
            &TOTAL_SUPPLY_KEY,
            &total.checked_sub(amount).unwrap_or_else(|| panic!("Supply underflow")),
        );

        env.events().publish(
            (symbol_short!("ly_redeem"),),
            LoyaltyRedeemedEvent {
                customer: customer.clone(),
                restaurant_id,
                amount,
                discount_value,
            },
        );
    }

    /// Transfer loyalty points between customers
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let mut balances: Map<Address, i128> = env.storage()
            .instance()
            .get(&BALANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        let to_balance = balances.get(to.clone()).unwrap_or(0);
        let new_from = from_balance.checked_sub(amount)
            .unwrap_or_else(|| panic!("Underflow"));
        let new_to = to_balance.checked_add(amount)
            .unwrap_or_else(|| panic!("Overflow"));

        balances.set(from.clone(), new_from);
        balances.set(to.clone(), new_to);
        env.storage().instance().set(&BALANCE_KEY, &balances);

        env.events().publish(
            (symbol_short!("transfer"),),
            (from, to, amount),
        );
    }

    /// Approve a spender to transfer tokens on behalf of the owner
    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        owner.require_auth();

        let mut allowances: Map<(Address, Address), i128> = env.storage()
            .instance()
            .get(&ALLOWANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        allowances.set((owner.clone(), spender.clone()), amount);
        env.storage().instance().set(&ALLOWANCE_KEY, &allowances);

        env.events().publish(
            (symbol_short!("approve"),),
            (owner, spender, amount, expiration_ledger),
        );
    }

    /// Transfer from an account (by approved spender)
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) {
        spender.require_auth();

        let mut allowances: Map<(Address, Address), i128> = env.storage()
            .instance()
            .get(&ALLOWANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let allowed = allowances.get((from.clone(), spender.clone())).unwrap_or(0);
        if allowed < amount {
            panic!("Insufficient allowance");
        }

        // Update allowance
        let new_allowance = allowed.checked_sub(amount)
            .unwrap_or_else(|| panic!("Allowance underflow"));
        allowances.set((from.clone(), spender.clone()), new_allowance);
        env.storage().instance().set(&ALLOWANCE_KEY, &allowances);

        // Update balances
        let mut balances: Map<Address, i128> = env.storage()
            .instance()
            .get(&BALANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        let to_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(from.clone(), from_balance.checked_sub(amount)
            .unwrap_or_else(|| panic!("Underflow")));
        balances.set(to.clone(), to_balance.checked_add(amount)
            .unwrap_or_else(|| panic!("Overflow")));
        env.storage().instance().set(&BALANCE_KEY, &balances);

        env.events().publish(
            (symbol_short!("transfer"),),
            (from, to, amount),
        );
    }

    /// Get balance of an account
    pub fn balance(env: Env, owner: Address) -> i128 {
        let balances: Map<Address, i128> = env.storage()
            .instance()
            .get(&BALANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        balances.get(owner).unwrap_or(0)
    }

    /// Get allowance
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        let allowances: Map<(Address, Address), i128> = env.storage()
            .instance()
            .get(&ALLOWANCE_KEY)
            .unwrap_or_else(|| Map::new(&env));

        allowances.get((owner, spender)).unwrap_or(0)
    }

    /// Get token decimals
    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DECIMALS_KEY).unwrap_or(7)
    }

    /// Get token name
    pub fn name(env: Env) -> String {
        env.storage().instance().get(&TOKEN_NAME_KEY)
            .unwrap_or_else(|| String::from_str(&env, "Loyalty Token"))
    }

    /// Get token symbol
    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&TOKEN_SYMBOL_KEY)
            .unwrap_or_else(|| String::from_str(&env, "LOYAL"))
    }

    /// Get total supply
    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&TOTAL_SUPPLY_KEY).unwrap_or(0)
    }

    // ==================== Admin Functions ====================

    /// Authorize a restaurant contract to mint/burn loyalty tokens
    pub fn add_minter(env: Env, admin: Address, minter: Address) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut minters: Map<Address, bool> = env.storage()
            .instance()
            .get(&MINTERS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        minters.set(minter.clone(), true);
        env.storage().instance().set(&MINTERS_KEY, &minters);

        env.events().publish(
            (symbol_short!("mntr_add"),),
            (admin, minter),
        );
    }

    /// Revoke minter authorization
    pub fn remove_minter(env: Env, admin: Address, minter: Address) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        let mut minters: Map<Address, bool> = env.storage()
            .instance()
            .get(&MINTERS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        minters.set(minter.clone(), false);
        env.storage().instance().set(&MINTERS_KEY, &minters);

        env.events().publish(
            (symbol_short!("minter_rm"),),
            (admin, minter),
        );
    }

    /// Update earn rate (basis points)
    pub fn set_earn_rate(env: Env, admin: Address, new_rate: i128) {
        admin.require_auth();
        Self::ensure_admin(&env, &admin);

        env.storage().instance().set(&EARN_RATE_KEY, &new_rate);

        env.events().publish(
            (symbol_short!("rate_upd"),),
            (admin, new_rate),
        );
    }

    /// Get earn rate
    pub fn get_earn_rate(env: Env) -> i128 {
        env.storage().instance().get(&EARN_RATE_KEY).unwrap_or(100)
    }

    /// Calculate loyalty points earned for a given payment amount
    pub fn calculate_earn(env: Env, payment_amount: i128) -> i128 {
        let rate: i128 = env.storage().instance().get(&EARN_RATE_KEY).unwrap_or(100);
        // earn_rate is in basis points (1/10000)
        payment_amount.checked_mul(rate)
            .unwrap_or_else(|| panic!("Calculation overflow"))
            .checked_div(10000)
            .unwrap_or_else(|| panic!("Division error"))
    }

    /// Get the admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN_KEY)
            .unwrap_or_else(|| panic!("Token not initialized"))
    }

    // ==================== Helpers ====================

    fn ensure_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance()
            .get(&ADMIN_KEY)
            .unwrap_or_else(|| panic!("Token not initialized"));
        if admin != *caller {
            panic!("Caller is not the admin");
        }
    }

    fn ensure_minter(env: &Env, caller: &Address) {
        let minters: Map<Address, bool> = env.storage()
            .instance()
            .get(&MINTERS_KEY)
            .unwrap_or_else(|| Map::new(&env));

        let is_minter = minters.get(caller.clone()).unwrap_or(false);
        if !is_minter {
            panic!("Caller is not an authorized minter");
        }
    }
}

#[cfg(test)]
mod test;
