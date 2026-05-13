---
agent_scope: "Owns the plan for rebuilding Supurr/BFR accounting from the liquidity-removal snapshot block."
do_not:
  - "Do not put tokenomics, airdrop allocation rules, or launch mechanics here; this file stops at accounting."
  - "Do not treat legacy Postgres vester balances as final on-chain vesting accounting; they are only comparison data."
  - "Do not bless a timestamp-corrected block as final unless it is proven to be the liquidity-removal block."
see_also:
  - "../index.ts"
  - "../BFR.ts"
  - "../fsBLP.ts"
  - "../staking.ts"
  - "../LP/Camelot.ts"
  - "../LP/gamma.ts"
  - "../LP.ts"
---

# Liquidity-Removal Accounting Plan

Final accounting must be a deterministic snapshot at the liquidity-removal block.

## Snapshot Block

| Item | Value | Status |
| --- | ---: | --- |
| Current repo block | `297801672` | invalid for final snapshot |
| Current repo timestamp | `2025-01-21T04:25:00Z` | verified by archive RPC |
| Exact 12h correction | `297800463` | timing candidate only |
| Candidate user block | `297801672` | dry-run candidate only |
| Final `MAIN_BLOCK_NUMBER` | `CONFIRMED_LIQUIDITY_REMOVAL_BLOCK` | required before final run |

Hard gate:

```text
final run allowed only when:
  snapshot tx hash is known
  snapshot tx block == MAIN_BLOCK_NUMBER
  tx/log evidence shows liquidity removal
  output manifest records all three
```

Observed during study:

| Check | Result |
| --- | --- |
| Blocks `297801672`, `297800463`, `297801672` | timestamps match the brief |
| Exact candidate windows | no Camelot burn, UniV3 pool burn, or Gamma withdraw found in the 10-block windows |
| `297801672` window | one PositionManager `Collect` at `297801674`; not enough to prove liquidity removal |
| Transpose config | current key returned unauthorized; event source must be refreshed |

## Current System Facts

| Area | Finding |
| --- | --- |
| Repo used | `/Users/amitsharma/Desktop/TokenLaunch/HLMigration` |
| Brief path | `/Users/amitsharma/Desktop/work/HLMigration` is missing |
| Entrypoint | `index.ts` |
| Hardcoded block | `index.ts:31` |
| Address seed | `account` + `vester` Postgres rows |
| Source DB counts | `account=26772`, `vester=4621` |
| Source DB columns | `account(address,bfr_aamount,es_bfr_aamount)`, `vester(address,v1balance,v2balance)` |
| Saved `data.json` rows | `26772` |
| Saved total | `110,995,092.248` BFR/esBFR units |

Current saved component totals:

| Component | Amount |
| --- | ---: |
| raw BFR | `99,999,999.999` |
| raw esBFR | `4,177,606.234` |
| fsBLP claimable | `225,121.151` |
| vester1 DB balance | `152,423.027` |
| vester2 DB balance | `3,485.925` |
| staking | `6,436,455.909` |
| Camelot | `0` |

## Current Flow

```text
Postgres account/vester
  -> AccountList seeded from DB
  -> archive multicalls at hardcoded block
  -> data.json
  -> CSV/Postgres loaders
```

Current code behavior:

| Component | Source | Problem |
| --- | --- | --- |
| raw BFR/esBFR | `balanceOf(account)` | only DB-seeded accounts |
| fsBLP | `claimable(account)` | no cap check against esBFR held by fsBLP |
| staking | `sbfBFR.depositBalances(account, sbBFR) + sBFR.claimable(account)` | formula not reconciled against tracker totals |
| vesters | Postgres `v1balance/v2balance` | not block-sensitive; misses on-chain `claimable` |
| Camelot | code exists | disabled in `index.ts` |
| UniV3/Gamma | exploratory code | no final formula |
| JSON | `BigInt.prototype.toJSON -> Number(this)` | precision loss |
| secrets | inline strings | must move to env |

## Target Sources

| Source | Purpose | Final role |
| --- | --- | --- |
| Archive RPC | block reads and multicalls | required |
| Event indexer: Ponder or valid SQL indexer | address universe and LP position discovery | required |
| Legacy source Postgres | comparison and gap analysis | not primary accounting |
| Target Postgres | optional load after artifact verification | not source of truth |
| Existing `ABI.ts` | starting ABI set | verify and trim |

## Address Universe

Build the universe from events up to and including `MAIN_BLOCK_NUMBER`.

| Domain | Include accounts from |
| --- | --- |
| BFR | all `Transfer.from` and `Transfer.to` on BFR |
| esBFR | all `Transfer.from` and `Transfer.to` on esBFR |
| vesters | `Deposit.account`, `Withdraw.account`, `Claim.receiver`; old and new vester |
| staking trackers | tracker `Transfer`, deposit/withdraw-style events, and reward recipients |
| fsBLP/BLP | BLP/fsBLP transfer holders and reward users |
| Camelot LP | LP token `Transfer`, `Mint`, `Burn`, and router recipients |
| Gamma vault | vault `Transfer`, `Deposit`, `Withdraw` users |
| UniV3 | pool `Mint/Burn/Collect` owners plus PositionManager token owners filtered to BFR pool positions |

Keep protocol contracts in the raw universe for reconciliation, but exclude them from end-user entitlements when their balances are allocated through a component formula.

Protocol/quarantine list starts with:

| Address | Role |
| --- | --- |
| `0x92f424a2A65efd48ea57b10D345f4B3f2460F8c8` | old vester |
| `0xF454b87b3DbE726157173A331234fE2d353DB0Dc` | new vester |
| `0xBABF696008DDAde1e17D302b972376B8A7357698` | sbfBFR tracker |
| `0x173817f33f1c09bcb0df436c2f327b9504d6e067` | sBFR tracker |
| `0x00B88B6254B51C7b238c4675E6b601a696CC1aC8` | sbBFR tracker |
| `0x7d1d610Fe82482412842e8110afF1cB72FA66bc8` | fsBLP |
| `0x47ECF602a62BaF7d4e6b30FE3E8dD45BB8cfFadc` | Camelot LP |
| `0xB529f885260321729D9fF1C69804c5Bf9B3a95A5` | UniV3 pool |
| `0x1E86A593E55215957C4755f1BE19a229AF3286f6` | Gamma vault |
| `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` | UniV3 PositionManager |
| `0x691FA1d4dc25f39a22Dc45Ca98080CF21Ca7eC64` | treasury; separate policy bucket |

## Component Formulas

All raw values are `uint256` strings. Human decimals are derived fields only.

| Component | Formula at `MAIN_BLOCK_NUMBER` | Token bucket |
| --- | --- | --- |
| raw BFR | `BFR.balanceOf(account)` | BFR |
| raw esBFR | `esBFR.balanceOf(account)` | esBFR |
| old vester locked | `oldVester.balanceOf(account)` or `balances(account)` | esBFR |
| old vester claimable | `oldVester.claimable(account)` | BFR |
| new vester locked | `newVester.balanceOf(account)` or `balances(account)` | esBFR |
| new vester claimable | `newVester.claimable(account)` | BFR |
| fsBLP rewards | `fsBLP.claimable(account)` | esBFR |
| staking principal | verified tracker deposit formula | BFR/esBFR split if contract exposes split |
| staking claimable | `sBFR.claimable(account)` after tracker verification | esBFR |
| Camelot LP | `BFR.balanceOf(camelotPair) * userLp / camelotTotalSupply` | BFR |
| Gamma vault | `gammaBfrTotal * userShares / gammaTotalSupply` using `getTotalAmounts()` | BFR |
| UniV3 NFT liquidity | BFR side of position liquidity at pool `slot0`, plus BFR `tokensOwed` | BFR |

Vester sample check already proves why DB balances are insufficient:

| Account | Block | `balanceOf` | `claimable` |
| --- | ---: | ---: | ---: |
| `0x6025870447e54d0ebcf7948966ec3d8619de22b1` old vester | `297801672` | `36346.343036` | `22891.108022571191019786` |
| same | `297801672` | `36346.343036` | `22941.24329407252283105` |

## Staking Verification

Do not ship the current staking formula until it passes these checks:

| Check | Acceptance |
| --- | --- |
| deposit token inventory | read tracker `depositBalances(account, BFR)`, `depositBalances(account, esBFR)`, `depositBalances(account, sbBFR)` where supported |
| tracker totals | sum user deposits equals relevant `totalDepositSupply(token)` within dust |
| claimable source | sum `claimable(account)` does not exceed reward token available for that tracker/distributor |
| vester overlap | locked esBFR in vesters is not double counted as staked esBFR |

## LP Verification

| LP | Required reads | Reconciliation |
| --- | --- | --- |
| Camelot | LP balances, totalSupply, BFR reserve/balance | sum user LP BFR <= pair BFR balance |
| Gamma | vault shares, totalSupply, token0/token1, getTotalAmounts | sum user BFR == vault BFR side within rounding |
| UniV3 | tokenId owner, positions, pool slot0, token0/token1, tokensOwed | sum per-position BFR <= computed pool BFR liquidity + owed fees |

PositionManager is global. Never count all PositionManager NFTs. Filter by `positions(tokenId).token0/token1` and the known BFR pool.

## Exclusions

| Exclusion | Reason |
| --- | --- |
| Post-snapshot claims/rewards | not present at snapshot |
| USDC/WETH side of LP | accounting goal is BFR/esBFR entitlement |
| DB vester balances as final | not block-sensitive |
| protocol contract raw balances | allocated through vesting/staking/LP formulas |
| treasury balance | separate policy bucket, not user entitlement by default |
| failed multicall rows | block finalization until resolved |

## Output Contract

Create one run directory:

```text
artifacts/snapshot-<MAIN_BLOCK_NUMBER>/
  manifest.json
  address-universe.json
  balances.raw.ndjson
  balances.by-address.json
  snapshot.csv
  totals.json
  validation-report.md
  failures.json
```

Required row fields:

| Field | Type |
| --- | --- |
| `address` | checksum address |
| `isProtocolContract` | boolean |
| `policyBucket` | `user`, `protocol`, `treasury`, `review` |
| each component raw amount | decimal string |
| each component human amount | string, derived only |
| `totalBfrRaw` | decimal string |
| `totalEsBfrRaw` | decimal string |
| `totalCombinedRaw` | decimal string |
| `evidence` | component call status and source |

`manifest.json` must include:

| Field | Required |
| --- | --- |
| `mainBlockNumber` | yes |
| `blockTimestampUtc` | yes |
| `liquidityRemovalTxHash` | yes for final |
| `repoPath` | yes |
| `rpcName` | yes, no secret |
| `addressUniverseSource` | yes |
| `componentVersions` | yes |
| `validationStatus` | yes |

## Validation Gates

Final artifact fails closed if any gate fails.

| Gate | Rule |
| --- | --- |
| snapshot block | final block has removal tx/log proof |
| call completeness | zero unresolved archive read failures |
| bigint safety | no `Number()` conversion in persisted raw amounts |
| vester | `balanceOf == balances` for sample set; claimable block sensitivity verified |
| fsBLP | total claimable <= esBFR held by fsBLP, otherwise proportional scaling is explicit |
| staking | tracker totals reconciled before inclusion |
| LP | each LP component reconciles to pool/vault/position totals |
| double count | protocol balances excluded from raw user entitlement |
| regression | old DB/data totals reproduced as comparison-only baseline |

## Execution Plan After Review

1. Move config to env and add a snapshot manifest.
2. Replace `blockNumber` with `MAIN_BLOCK_NUMBER` loaded from config.
3. Build event-derived address universe export.
4. Replace `AccountList` arrays with typed component rows.
5. Implement raw BFR/esBFR reads over full universe.
6. Implement vester locked + claimable reads from both vesters.
7. Verify and implement staking formulas.
8. Implement fsBLP claimable with cap/scaling check.
9. Implement Camelot, Gamma, and UniV3 BFR-side LP accounting.
10. Write bigint-safe artifacts and CSV.
11. Run validation gates and produce `validation-report.md`.

No final rerun should start until `MAIN_BLOCK_NUMBER` is proven by the liquidity-removal transaction.
