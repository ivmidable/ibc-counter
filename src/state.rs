use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, IbcEndpoint};
use cw_storage_plus::Item;

#[cw_serde]
pub struct State {
    pub count: i32,
    pub owner: Addr,
    pub endpoint: Option<IbcEndpoint>
}

pub const STATE: Item<State> = Item::new("state");
