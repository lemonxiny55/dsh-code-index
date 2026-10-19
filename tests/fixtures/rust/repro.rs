// Issue #5: preserve declaration names with and without public visibility.
pub struct PublicOne { pub field: u32 }
struct PrivateOne { field: u32 }
pub enum PublicEnum { A }
enum PrivateEnum { A }
pub trait PublicTrait { fn run(&self); }
trait PrivateTrait { fn run(&self); }
pub fn public_function(a: u32) -> u32 { a }
fn private_function(a: u32) -> u32 { a }
