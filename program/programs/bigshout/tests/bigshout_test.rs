//! Integration tests on LiteSVM with the REAL TxLINE oracle binary (dumped
//! from devnet) at its live program id — and, for the YES path, a REAL
//! Merkle proof (England 1–2 Argentina, seq 962) verified against the REAL
//! daily-root account dumped from devnet. The end-to-end settlement test is
//! a genuine oracle verification, not a mock.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use base64::Engine;
use bigshout::state::{Market, MarketStatus, Player, Position};
use bigshout::txoracle;
use bigshout::txoracle::types::{
    ProofNode, ScoreStat, ScoresBatchSummary, ScoresUpdateStats, StatLeaf, StatValidationInput,
};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

const LAMPORTS: u64 = 1_000_000_000;

/// England vs Argentina SF — the fixture behind fixtures/real_proof.json.
const REAL_FIXTURE: i64 = 18241006;
/// statKeys=2 (P2 total goals), proven value 2 at seq 962.
const REAL_STAT_KEY: u32 = 2;
const REAL_PROOF_TS_MS: i64 = 1_784_150_064_772;

struct Ctx {
    svm: LiteSVM,
    admin: Keypair,
    alice: Keypair,
    bob: Keypair,
}

fn setup() -> Ctx {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(bigshout::ID, "../../target/deploy/bigshout.so")
        .expect("load bigshout.so — run `anchor build` first");
    svm.add_program_from_file(txoracle::ID, "tests/fixtures/txoracle_devnet.so")
        .expect("load txoracle_devnet.so — run `solana program dump` first");
    let admin = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    for kp in [&admin, &alice, &bob] {
        svm.airdrop(&kp.pubkey(), 10 * LAMPORTS).unwrap();
    }
    let mut c = Ctx { svm, admin, alice, bob };
    init_config(&mut c).unwrap();
    c
}

// ---- PDAs ----

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &bigshout::ID).0
}
fn market_pda(market_id: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"market", &market_id.to_le_bytes()], &bigshout::ID).0
}
fn position_pda(market: &Pubkey, user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"position", market.as_ref(), user.as_ref()], &bigshout::ID).0
}
fn player_pda(user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"player", user.as_ref()], &bigshout::ID).0
}
fn daily_root_pda(ts_ms: i64) -> Pubkey {
    let epoch_day = (ts_ms / 86_400_000) as u16;
    Pubkey::find_program_address(&[b"daily_scores_roots", &epoch_day.to_le_bytes()], &txoracle::ID).0
}

// ---- plumbing ----

fn send(svm: &mut LiteSVM, signers: &[&Keypair], payer: &Pubkey, ix: Instruction) -> std::result::Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new(&[ix], Some(payer));
    let tx = Transaction::new(signers, msg, svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_to(svm: &mut LiteSVM, ts: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.set_sysvar(&clock);
}

fn init_config(c: &mut Ctx) -> std::result::Result<(), String> {
    let admin = c.admin.insecure_clone();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::InitConfig {
            admin: admin.pubkey(),
            config: config_pda(),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: bigshout::instruction::InitConfig {}.data(),
    };
    send(&mut c.svm, &[&admin], &admin.pubkey(), ix)
}

#[allow(clippy::too_many_arguments)]
fn create_market_as(
    c: &mut Ctx,
    who: &Keypair,
    market_id: u64,
    fixture_id: i64,
    stat_key: u32,
    threshold: i32,
    deadline_ts: i64,
) -> std::result::Result<Pubkey, String> {
    let who = who.insecure_clone();
    let market = market_pda(market_id);
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::CreateMarket {
            authority: who.pubkey(),
            config: config_pda(),
            market,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: bigshout::instruction::CreateMarket {
            market_id,
            fixture_id,
            stat_key,
            threshold,
            deadline_ts,
            yes_odds_bps: 30_000, // 3.0x
            no_odds_bps: 13_000,  // 1.3x
        }
        .data(),
    };
    send(&mut c.svm, &[&who], &who.pubkey(), ix).map(|_| market)
}

fn predict(c: &mut Ctx, user: &Keypair, market: Pubkey, side: bool, amount: u64) -> std::result::Result<(), String> {
    let user = user.insecure_clone();
    let payer = c.admin.insecure_clone();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::Predict {
            user: user.pubkey(),
            payer: payer.pubkey(),
            market,
            player: player_pda(&user.pubkey()),
            position: position_pda(&market, &user.pubkey()),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: bigshout::instruction::Predict { side, amount }.data(),
    };
    send(&mut c.svm, &[&payer, &user], &payer.pubkey(), ix)
}

fn settle_proven(c: &mut Ctx, market: Pubkey, payload: StatValidationInput, root: Pubkey) -> std::result::Result<(), String> {
    let admin = c.admin.insecure_clone();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::SettleProven {
            settler: admin.pubkey(),
            market,
            daily_scores_merkle_roots: root,
            txoracle_program: txoracle::ID,
        }
        .to_account_metas(None),
        data: bigshout::instruction::SettleProven { payload }.data(),
    };
    send(&mut c.svm, &[&admin], &admin.pubkey(), ix)
}

fn settle_expired(c: &mut Ctx, market: Pubkey) -> std::result::Result<(), String> {
    let admin = c.admin.insecure_clone();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::SettleExpired { settler: admin.pubkey(), market }
            .to_account_metas(None),
        data: bigshout::instruction::SettleExpired {}.data(),
    };
    send(&mut c.svm, &[&admin], &admin.pubkey(), ix)
}

fn claim(c: &mut Ctx, market: Pubkey, user: &Pubkey) -> std::result::Result<(), String> {
    let admin = c.admin.insecure_clone();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::Claim {
            market,
            position: position_pda(&market, user),
            player: player_pda(user),
        }
        .to_account_metas(None),
        data: bigshout::instruction::Claim {}.data(),
    };
    send(&mut c.svm, &[&admin], &admin.pubkey(), ix)
}

fn get<T: AccountDeserialize>(c: &Ctx, addr: Pubkey) -> T {
    let acc = c.svm.get_account(&addr).unwrap();
    T::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

// ---- fixtures ----

fn json_nodes(v: &serde_json::Value) -> Vec<ProofNode> {
    v.as_array()
        .map(|a| {
            a.iter()
                .map(|n| ProofNode {
                    hash: json_32(&n["hash"]),
                    is_right_sibling: n["isRightSibling"].as_bool().unwrap(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn json_32(v: &serde_json::Value) -> [u8; 32] {
    let bytes: Vec<u8> = v.as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u8).collect();
    bytes.try_into().unwrap()
}

/// The real England–Argentina proof captured from the devnet API.
fn real_payload() -> StatValidationInput {
    let v: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/real_proof.json")).unwrap();
    let s = &v["summary"];
    StatValidationInput {
        ts: s["updateStats"]["minTimestamp"].as_i64().unwrap(),
        fixture_summary: ScoresBatchSummary {
            fixture_id: s["fixtureId"].as_i64().unwrap(),
            update_stats: ScoresUpdateStats {
                update_count: s["updateStats"]["updateCount"].as_i64().unwrap() as i32,
                min_timestamp: s["updateStats"]["minTimestamp"].as_i64().unwrap(),
                max_timestamp: s["updateStats"]["maxTimestamp"].as_i64().unwrap(),
            },
            events_sub_tree_root: json_32(&s["eventStatsSubTreeRoot"]),
        },
        fixture_proof: json_nodes(&v["subTreeProof"]),
        main_tree_proof: json_nodes(&v["mainTreeProof"]),
        event_stat_root: json_32(&v["eventStatRoot"]),
        stats: v["statsToProve"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
            .map(|(i, st)| StatLeaf {
                stat: ScoreStat {
                    key: st["key"].as_u64().unwrap() as u32,
                    value: st["value"].as_i64().unwrap() as i32,
                    period: st["period"].as_i64().unwrap() as i32,
                },
                stat_proof: json_nodes(&v["statProofs"][i]),
            })
            .collect(),
    }
}

/// The real daily-root account for the proof's epoch day, dumped from devnet
/// and installed at its live PDA so the oracle's Merkle check runs for real.
fn install_real_root(svm: &mut LiteSVM) -> Pubkey {
    let v: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/daily_root_20649.json")).unwrap();
    let acc = &v["account"];
    let data = base64::engine::general_purpose::STANDARD
        .decode(acc["data"][0].as_str().unwrap())
        .unwrap();
    let root = daily_root_pda(REAL_PROOF_TS_MS);
    svm.set_account(
        root,
        Account {
            lamports: acc["lamports"].as_u64().unwrap(),
            data,
            owner: txoracle::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    root
}

fn fake_payload(fixture_id: i64, ts: i64, key: u32) -> StatValidationInput {
    StatValidationInput {
        ts,
        fixture_summary: ScoresBatchSummary {
            fixture_id,
            update_stats: ScoresUpdateStats { update_count: 1, min_timestamp: ts, max_timestamp: ts },
            events_sub_tree_root: [0u8; 32],
        },
        fixture_proof: vec![ProofNode { hash: [1u8; 32], is_right_sibling: false }],
        main_tree_proof: vec![ProofNode { hash: [2u8; 32], is_right_sibling: true }],
        event_stat_root: [3u8; 32],
        stats: vec![StatLeaf {
            stat: ScoreStat { key, value: 5, period: 0 },
            stat_proof: vec![ProofNode { hash: [4u8; 32], is_right_sibling: false }],
        }],
    }
}

// ---------------------------------------------------------------------------

/// The money test: a REAL Merkle proof, verified by the REAL oracle binary
/// against the REAL on-chain daily root, settles a market YES — then claims
/// pay at the locked odds and reputation updates.
#[test]
fn real_proof_settles_yes_end_to_end() {
    let mut c = setup();
    let alice = c.alice.insecure_clone();
    let bob = c.bob.insecure_clone();
    let proof_sec = REAL_PROOF_TS_MS / 1000;
    warp_to(&mut c.svm, proof_sec - 600);

    let root = install_real_root(&mut c.svm);
    let admin = c.admin.insecure_clone();
    // "Argentina to score again" style card: threshold 1, proven value 2.
    let market = create_market_as(&mut c, &admin, 1, REAL_FIXTURE, REAL_STAT_KEY, 1, proof_sec + 3600).unwrap();

    predict(&mut c, &alice, market, true, 200).unwrap();
    predict(&mut c, &bob, market, false, 100).unwrap();

    // Allowance: first prediction of the day topped up to 1000, then staked.
    let ap: Player = get(&c, player_pda(&alice.pubkey()));
    assert_eq!(ap.points, 800);
    let apos: Position = get(&c, position_pda(&market, &alice.pubkey()));
    assert_eq!(apos.odds_bps, 30_000); // sealed at the price taken

    let m: Market = get(&c, market);
    assert_eq!((m.yes_count, m.no_count), (1, 1));
    assert_eq!((m.yes_staked, m.no_staked), (200, 100));

    settle_proven(&mut c, market, real_payload(), root).unwrap();
    let m: Market = get(&c, market);
    assert_eq!(m.status, MarketStatus::YesWon, "real proof must settle YES");
    assert_eq!(m.settled_proof_ts, REAL_PROOF_TS_MS);

    // double-settle blocked
    let err = settle_proven(&mut c, market, real_payload(), root).unwrap_err();
    assert!(err.contains("Custom(6003)"), "{err}"); // MarketNotOpen

    // claims: winner paid at locked odds, loser's record updated
    claim(&mut c, market, &alice.pubkey()).unwrap();
    let ap: Player = get(&c, player_pda(&alice.pubkey()));
    assert_eq!(ap.points, 800 + 200 * 3); // 200 @ 3.0x
    assert_eq!((ap.correct, ap.total, ap.streak), (1, 1, 1));

    claim(&mut c, market, &bob.pubkey()).unwrap();
    let bp: Player = get(&c, player_pda(&bob.pubkey()));
    assert_eq!(bp.points, 900);
    assert_eq!((bp.correct, bp.total, bp.streak), (0, 1, 0));

    // double-claim blocked, position persists as the receipt
    let err = claim(&mut c, market, &alice.pubkey()).unwrap_err();
    assert!(err.contains("Custom(6014)"), "{err}"); // AlreadyClaimed
    let apos: Position = get(&c, position_pda(&market, &alice.pubkey()));
    assert!(apos.claimed && apos.won);
}

/// NO settles by expiry — but only after the on-chain grace period, so an
/// expiry racer can't flip a market while a YES proof is still in flight.
#[test]
fn expiry_settles_no_after_grace() {
    let mut c = setup();
    let alice = c.alice.insecure_clone();
    let t0 = now(&c.svm).max(1_000_000);
    warp_to(&mut c.svm, t0);
    let admin = c.admin.insecure_clone();
    let market = create_market_as(&mut c, &admin, 2, 42, 1, 0, t0 + 50).unwrap();
    predict(&mut c, &alice, market, false, 100).unwrap();

    // deadline passed but grace hasn't: too early
    warp_to(&mut c.svm, t0 + 60);
    let err = settle_expired(&mut c, market).unwrap_err();
    assert!(err.contains("Custom(6012)"), "{err}"); // ExpiryTooEarly

    warp_to(&mut c.svm, t0 + 50 + 180 + 1);
    settle_expired(&mut c, market).unwrap();
    let m: Market = get(&c, market);
    assert_eq!(m.status, MarketStatus::NoWon);

    claim(&mut c, market, &alice.pubkey()).unwrap();
    let ap: Player = get(&c, player_pda(&alice.pubkey()));
    assert_eq!(ap.points, 900 + 130); // 1000 - 100 stake + 100 @ 1.3x
    assert_eq!((ap.correct, ap.streak), (1, 1));
}

/// Replay and mismatch protection: a proof can only settle the market it
/// belongs to, on the day it belongs to, inside the window it belongs to.
#[test]
fn settle_rejects_mismatched_and_late_proofs() {
    let mut c = setup();
    let proof_sec = REAL_PROOF_TS_MS / 1000;
    warp_to(&mut c.svm, proof_sec - 600);
    let root = install_real_root(&mut c.svm);
    let admin = c.admin.insecure_clone();

    // wrong fixture
    let m1 = create_market_as(&mut c, &admin, 10, 99, REAL_STAT_KEY, 1, proof_sec + 3600).unwrap();
    let err = settle_proven(&mut c, m1, real_payload(), root).unwrap_err();
    assert!(err.contains("Custom(6007)"), "{err}"); // FixtureMismatch

    // wrong stat key (market wants P1 goals, proof proves P2)
    let m2 = create_market_as(&mut c, &admin, 11, REAL_FIXTURE, 1, 0, proof_sec + 3600).unwrap();
    let err = settle_proven(&mut c, m2, real_payload(), root).unwrap_err();
    assert!(err.contains("Custom(6008)"), "{err}"); // StatKeyMismatch

    // right market, wrong day's root account
    let m3 = create_market_as(&mut c, &admin, 12, REAL_FIXTURE, REAL_STAT_KEY, 1, proof_sec + 3600).unwrap();
    let wrong_root = daily_root_pda(REAL_PROOF_TS_MS - 5 * 86_400_000);
    let err = settle_proven(&mut c, m3, real_payload(), wrong_root).unwrap_err();
    assert!(err.contains("Custom(6010)"), "{err}"); // WrongRootAccount

    // proof timestamped after the market window: a late goal can't settle a missed call
    warp_to(&mut c.svm, proof_sec - 7200);
    let m4 = create_market_as(&mut c, &admin, 13, REAL_FIXTURE, REAL_STAT_KEY, 1, proof_sec - 3600).unwrap();
    let err = settle_proven(&mut c, m4, real_payload(), root).unwrap_err();
    assert!(err.contains("Custom(6009)"), "{err}"); // ProofAfterDeadline
}

/// A structurally valid but cryptographically fake proof must flow through
/// our program, CPI into the REAL oracle binary, and come back rejected —
/// with no state change. If this fails with a wiring error instead, the CPI
/// interface is broken.
#[test]
fn fake_proof_rejected_by_real_oracle() {
    let mut c = setup();
    let proof_sec = REAL_PROOF_TS_MS / 1000;
    warp_to(&mut c.svm, proof_sec - 600);
    let root = install_real_root(&mut c.svm);
    let admin = c.admin.insecure_clone();

    let market = create_market_as(&mut c, &admin, 20, REAL_FIXTURE, REAL_STAT_KEY, 1, proof_sec + 3600).unwrap();
    let err = settle_proven(&mut c, market, fake_payload(REAL_FIXTURE, REAL_PROOF_TS_MS, REAL_STAT_KEY), root).unwrap_err();
    println!("oracle rejection (expected): {err}");
    assert!(
        !err.contains("InstructionFallbackNotFound") && !err.contains("InvalidInstructionData"),
        "CPI interface mis-wired: {err}"
    );
    let m: Market = get(&c, market);
    assert_eq!(m.status, MarketStatus::Open, "market must not settle on a fake proof");
}

/// Only the config admin prices markets — otherwise a player could create
/// and price their own bet and farm the leaderboard.
#[test]
fn non_admin_cannot_create_or_reprice_markets() {
    let mut c = setup();
    let mallory = c.alice.insecure_clone();
    let t0 = now(&c.svm).max(1_000_000);
    warp_to(&mut c.svm, t0);

    let err = create_market_as(&mut c, &mallory, 30, 42, 1, 0, t0 + 100).unwrap_err();
    assert!(err.contains("Custom(6000)"), "{err}"); // NotAdmin

    let admin = c.admin.insecure_clone();
    let market = create_market_as(&mut c, &admin, 31, 42, 1, 0, t0 + 100).unwrap();
    let ix = Instruction {
        program_id: bigshout::ID,
        accounts: bigshout::accounts::UpdateOdds {
            authority: mallory.pubkey(),
            config: config_pda(),
            market,
        }
        .to_account_metas(None),
        data: bigshout::instruction::UpdateOdds { yes_odds_bps: 500_000, no_odds_bps: 10_500 }.data(),
    };
    let err = send(&mut c.svm, &[&mallory], &mallory.pubkey(), ix).unwrap_err();
    assert!(err.contains("Custom(6000)"), "{err}"); // NotAdmin

    // and the config can't be re-initialized to steal the admin role
    let err = init_config(&mut c).unwrap_err();
    // system CreateAccount on an existing account -> SystemError 0
    assert!(err.contains("Custom(0)") || err.contains("already in use"), "{err}");
}

/// Point economics: allowance, insufficient stake, deadline, one call per card.
#[test]
fn predict_guards_and_daily_allowance() {
    let mut c = setup();
    let alice = c.alice.insecure_clone();
    let t0 = 2_000_000_000i64; // fixed epoch so day math is deterministic
    warp_to(&mut c.svm, t0);
    let admin = c.admin.insecure_clone();
    let m1 = create_market_as(&mut c, &admin, 40, 42, 1, 0, t0 + 1000).unwrap();

    // more than the daily allowance
    let err = predict(&mut c, &alice, m1, true, 2000).unwrap_err();
    assert!(err.contains("Custom(6006)"), "{err}"); // InsufficientPoints
    // zero stake
    let err = predict(&mut c, &alice, m1, true, 0).unwrap_err();
    assert!(err.contains("Custom(6005)"), "{err}"); // ZeroAmount

    // stake the whole allowance, then be broke today
    predict(&mut c, &alice, m1, true, 1000).unwrap();
    let m2 = create_market_as(&mut c, &admin, 41, 42, 1, 0, t0 + 1000).unwrap();
    let err = predict(&mut c, &alice, m2, true, 50).unwrap_err();
    assert!(err.contains("Custom(6006)"), "{err}");

    // one swipe per card: a second position on m1 cannot exist
    let err = predict(&mut c, &alice, m1, false, 10).unwrap_err();
    // position PDA already exists -> system CreateAccount fails with SystemError 0
    assert!(err.contains("Custom(0)") || err.contains("already in use"), "{err}");

    // next UTC day: allowance refills to the floor on first prediction
    warp_to(&mut c.svm, t0 + 86_400);
    let m3 = create_market_as(&mut c, &admin, 42, 42, 1, 0, t0 + 86_400 + 1000).unwrap();
    predict(&mut c, &alice, m3, true, 400).unwrap();
    let ap: Player = get(&c, player_pda(&alice.pubkey()));
    assert_eq!(ap.points, 600); // refilled to 1000, staked 400

    // market past its deadline takes no more calls
    warp_to(&mut c.svm, t0 + 86_400 + 2000);
    let bob = c.bob.insecure_clone();
    let err = predict(&mut c, &bob, m3, true, 10).unwrap_err();
    assert!(err.contains("Custom(6004)"), "{err}"); // PredictionsClosed
}
