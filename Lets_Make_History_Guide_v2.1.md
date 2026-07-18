**Let's Make History\!**

Guide v2.1 — Companion Edition

*This document supersedes Guide Beta 1.02 and any previous session. Numeric mechanics described here (stat deltas, election math, bounds) are also implemented in the GM companion tool; where the two ever disagree, this document is authoritative unless the Game Master states otherwise in session.*

# Overview

The year is 1901\. President Theodore Roosevelt was just elected and has a clear vision for the United States after the turn of the 20th century. William McKinley's presidency and assassination never occurred in this game's universe. How will you make an impact, and climb the political ladder yourself?

# Game Setup

* The game is primarily run by a Game Master (GM). Claude generates events, NPC proposed legislation, Supreme Court decisions, newspaper headlines, the national status update, and stat adjustment rolls.

* The year always starts at 1901, with two turns comprising each year. Theodore Roosevelt always starts as President.

* Players act as Senators, the only legislative body in this game. Each player selects an ideology (party) and region.

* Each player Senator replaces one NPC Senator from their chosen region and Senate class, keeping total Senate size consistent. The GM removes the NPC Senator of the player's party (or the lowest-ranked party in that region if no match) when a player joins.

* Player creation is submitted to the GM in this format: Player Name — Region — Party — Class. The class tells the GM (and the companion) which of that region's three seats the player occupies, and therefore which election cycle they're up for reelection.

# Core Gameplay Loop

Each turn represents half of a calendar year. Every turn follows the same format, using line breaks and emojis for clarity:

* Turn number and year.

* Newspaper headlines — exactly one from The Associated Press (non-partisan, readership-focused) and one from The American Standard (right-aligned, Rockefeller-owned). Never more than one per outlet.

* National Status — Financial, Social, and Foreign status. These are narrative tools with no automatic mechanical effect unless the GM says otherwise.

* Three Events. Each has a 30% chance to trigger exactly one stat adjustment (see Stats, below). If it doesn't trigger, mark: “Stat Adjustment: None for this event (narrative only).” All events should be plausible for the real-world year in question and responsive to in-game actions.

* One Supreme Court Decision. 20% chance to trigger exactly one stat adjustment. If it doesn't trigger, mark: “Stat Adjustment: None for this decision (narrative only).”

* Three NPC Proposed Bills, one per party shown, no repeat parties, no senator name or region attached — party only.

* Players vote on NPC bills. The GM collects votes and inputs the final tally to Claude before player actions are generated — Claude never determines vote totals or bill passage.

* A bill passes with a simple majority of all votes cast (players and NPCs). The GM determines how NPCs vote and whether the President signs or vetoes. A veto may be overridden by a ⅔ majority of the Senate.

* Each NPC bill has a 30% chance (rolled only after the vote/veto outcome is known) to trigger exactly one stat adjustment, affecting only one stat. A failed roll is purely narrative: “Stat Adjustment: None for this bill.”

* Constitutional amendments may only be proposed by players. They require a ¾ majority in the Senate, the President's signature, and support from at least 4 of the 6 regions.

* After NPC bills are resolved, players take their turns — proposing legislation or campaigning for themselves or others, subject to GM approval. Player actions have no predetermined mechanical effect; each action results in exactly one stat change, with Claude choosing the stat and direction based on the nature of the action. Players may cooperate or sabotage each other freely; these interactions are resolved narratively by the GM.

*In a typical turn, 0–3 of the Events \+ Supreme Court elements will cause a stat change. It is possible but statistically rare for all of them to trigger — treat that as an unusual outcome.*

# Stats

Only one stat adjustment can occur per event, passed bill, or player action. Each adjustment is Small, Medium, or Large — rolled at a 60% / 30% / 10% split — and is either an increase or a decrease.

## Definitions

* Player Approval — how much a player is liked. Starts at 50\. Used to determine the Senate incumbent bonus (see Elections).

* Player Recognition — how many voters know the player. Starts at 10\. Needs to reach 50 for a player to be eligible to run for President.

* Player Rizz — how influential a player is with NPC Senators and the President. Starts at 0\. Rizz is spent by the GM as a currency to get NPC Senators or the President to act outside their typical behavior — it is not lost through random stat rolls, only through deliberate spending.

* Party Approval — how liked a party is nationally. Starts varied by party. Used for Senate and Presidential elections.

* Regional Party Modifier — a multiplier representing how favored a party is in a given region's demographics. A region's weighted approval for a party is Party Approval × that region's modifier for that party. Starting values are seeded in the companion from game start and drift slowly as events land on this stat.

## Adjustment sizes

| Stat | Small | Medium | Large |
| :---- | :---- | :---- | :---- |
| Player Approval | ±0.5 | ±1 | ±2 |
| Player Recognition | ±5 | ±10 | ±15 |
| Player Rizz | \+1 only (no categories, gain-only) | — | — |
| Party Approval | ±0.5 | ±1 | ±2 |
| Regional Party Modifier | ±0.05 | ±0.1 | ±0.2 |

## Bounds

| Stat | Floor | Ceiling |
| :---- | :---- | :---- |
| Player Approval | 25 | 70 |
| Player Recognition | 0 | 100 |
| Player Rizz | 0 | none |
| Party Approval | 0 | 100 |
| Regional Party Modifier | 0 | none |

*The Party Approval and Regional Party Modifier floor/ceiling are companion defaults rather than an explicit ruling — tell the GM to adjust the companion's settings if a different bound is intended.*

## How the roll works

* Claude rolls the trigger chance, the size category, and the raw increase/decrease direction using actual code execution (not narrative guesswork), against the odds above.

* The roll's direction is a starting suggestion, not a final answer. Claude must still be able to state a clear, specific in-world cause for a positive adjustment. If the roll comes back positive but the narrative doesn't support it, Claude overrides the roll to negative. A roll's direction is never overridden from negative to positive.

* Each stat's target and size category are chosen independently for each triggering event, bill, or action — repeats on the same stat within a turn are allowed and are not artificially forced in either direction.

## The Turn Ledger

At the end of every turn, after all narrative content, Claude outputs a single fenced block in this exact format so the GM can paste it directly into the companion:

TURN LEDGER — Turn \<\#\>, \<year\>

\<Stat\> | \<Target\> | \<signed delta\> | \<one-line reason\>

Where Stat is one of Approval, Recognition, Rizz, Party, or Region; Target is the player's name, the party name, or Region:Party for a Regional Party Modifier change; and the delta already reflects the rolled size and direction. Example:

TURN LEDGER — Turn 3, 1902

Approval | Jack Kelley | \+2 | Rockefeller-owned paper praised his labor bill

Party | Whig | \-0.5 | Bank failure blamed on Whig deregulation

Region | South:Conservative | \+0.1 | Planter coalition rallies behind the Conservative senator

*If nothing triggered a stat change this turn, Claude still outputs the header line with no rows beneath it, so the ledger of “quiet” turns is unambiguous.*

# Bill and Amendment Votes

The GM determines how the Senate votes and whether the President signs or vetoes — Claude never determines vote totals or bill passage. The companion assists with this: it rolls each NPC senator's vote individually against an odds table, so the GM isn't hand-counting up to 18 seats or eyeballing consistency turn to turn.

* Each party's default lean on a bill is set by its ideological distance from the proposing party on the Progressive – Union – Whig – Conservative spectrum, not by re-reading the bill's content each time. The GM (or Claude, narrating the bill) can still override any single party's lean when a specific bill's content cuts against pure ideology.

| Distance from proposing party | Lean | Yes-probability |
| :---- | :---- | :---- |
| 0 (the proposing party itself) | Strongly for | 90% |
| 1 (adjacent party) | Lean for | 70% |
| 2 (two steps away) | Lean against | 30% |
| 3 (opposite end of the spectrum) | Strongly against | 10% |

*Toss-up (50%) is never a default — it's only reachable by an explicit override, or by a Rizz boost pushing a lean-against party up a notch.*

* The President is treated as a fifth “party” for this purpose, using their own party's distance from the proposing party, and gets their own signature roll once the Senate result is known.

* Spending Rizz on a bill bumps that party's (or the President's) lean one notch toward for — e.g. lean against becomes toss-up, strongly for stays capped at 90%.

* Player Senators vote for themselves; every NPC seat rolls independently against its party's final probability. This is seat-by-seat off the live Senate roster, not a flat party-wide average, so it reflects exactly how many seats each party currently holds in each region.

* NPC and player bills pass with a simple majority of votes cast (Yea vs. Nay; abstentions aren't counted in the denominator). Constitutional amendments require a ¾ majority of votes cast and a majority in at least 4 of the 6 regions' own three-seat delegations.

* If the Senate result passes, the President's signature is rolled the same way. A veto on an ordinary bill can be overridden by ⅔ of the same votes cast. Amendments have no override path — the President's signature is a hard requirement.

# Elections

## Senate elections

* The Senate follows a Class structure. Each region has three seats, Classes 1, 2, and 3\. Only one class comes up for election per region, at the end of every even-numbered year — Class 1 one even year, Class 2 the next, Class 3 the one after that, then back to Class 1\.

* For the class up this cycle, in each region: the default winner is whichever party currently has the highest weighted regional approval (Party Approval × Regional Modifier) in that region.

* Underdog exception: if the seat up for election is held by a player Senator running for reelection, and that player's party is the region's second-most-popular (not the current leader), the player can hold the seat against the default. Compute a Buffer \= 5 \+ (the player's current Approval − 50). If Buffer is greater than the gap between the top party's and the player's party's regional approval, the player's party keeps the seat instead of losing it to the leading party. This bonus applies only to a player Senator, only in their own class, and never to NPCs or to the President.

* Worked example: a region's top party leads the player's party by 6 points. The player started at 50 Approval and is now at 53 (net gain of 3\) and is an incumbent running for reelection, so Buffer \= 5 \+ 3 \= 8\. Since 8 \> 6, the player wins — the leading party would have needed a gap greater than 8 points to unseat them.

* Special elections (vacancies): if a Senate seat is vacated outside its normal election year (e.g. a player Senator wins the Presidency mid-term), the seat is filled by the region's currently most-popular party. The companion will flag this for the GM to confirm before it's applied, since it happens rarely enough to warrant a manual check.

## Presidential elections

Presidential elections occur at the end of every eighth turn (every four years). There are always exactly two nominees.

* If the incumbent President is running for reelection (as directed by the GM, unless an in-game law states otherwise): their challenger is the most popular party nationally — or, if that happens to be the incumbent's own party, the next most popular party instead.

* If the incumbent is not running for reelection, or a constitutional amendment bars a third term, the two most popular parties nationally each field a nominee.

* Each party's nominee is normally the pre-set candidate for that election year (seeded in the companion from game start). If a player has reached 50 Recognition, belongs to whichever party is currently 1st or 2nd nationally, and chooses to run, they become that party's nominee in place of the pre-set candidate. The opposing slot is then filled per the rules above as normal.

* The President never receives an incumbent bonus in a Presidential election — holding the office (and likely a Senate majority) already carries its own approval advantage. The incumbent bonus described under Senate elections applies only to player Senators.

* General election: each of the six regions has a single elector. A region's elector goes to whichever nominee has the higher weighted regional approval in that region. Whoever wins more of the six electors wins the Presidency.

* Tie-break: if the electors split 3–3, Claude determines a popular-vote winner using the region-by-region approval numbers — summing each nominee's weighted regional approval across all six regions rather than relying on the flat national number, since that better reflects how turnout actually varies by region. The exact vote count is never calculated or displayed; only which nominee's total is higher.

# Party Ideologies

## Progressive

* Economic Policy: strong regulation of industry, labor rights, and social welfare programs.

* Foreign Policy: promote democracy and human rights but oppose imperialism.

* Social Policy: push civil rights and worker protections.

## Unionist

* Economic Policy: moderate government intervention, favoring infrastructure projects and labor protections.

* Foreign Policy: pragmatic, balancing diplomacy with military readiness.

* Social Policy: gradual reforms while respecting tradition.

## Whig

* Economic Policy: free-market capitalism with limited but effective government oversight, prioritizing business growth and industrial expansion.

* Foreign Policy: strong national defense and an assertive but calculated approach.

* Social Policy: stability and gradual progress while preserving traditional values.

## Conservative

* Economic Policy: laissez-faire economics, low taxes, minimal government intervention in business.

* Foreign Policy: strong military and expansionist foreign policy to protect American interests.

* Social Policy: oppose social change, prioritize established hierarchies and cultural norms.

# Regions

| Region | Voter profile (most → least popular) |
| :---- | :---- |
| Midwest | Unionist – Progressive – Whig – Conservative |
| Mountain | Whig – Unionist – Conservative – Progressive |
| Northeast | Progressive – Unionist – Whig – Conservative |
| South | Conservative – Whig – Unionist – Progressive |
| Southwest | Whig – Conservative – Unionist – Progressive |
| West | Progressive – Unionist – Whig – Conservative |

*Voter profile order at game start; regions' actual standings drift over time as Party Approval and Regional Party Modifiers change, and elections use the live numbers, not this starting order.*

# GM Quick Reference

* Stat adjustment chance: Events 30%, Supreme Court 20%, Bills 30% (rolled only after passage/veto is resolved).

* Adjustment sizes: Small 60% / Medium 30% / Large 10%, rolled in code, direction narrative-gated.

* Typical stat changes per turn: 0–3.

* Bill passage: simple majority; President signs or vetoes; ⅔ override.

* Amendment passage: ¾ Senate \+ Presidential signature \+ 4 of 6 regions.

* Senate elections: one class per region, end of every even year, cycling Class 1 → 2 → 3 → 1\.

* Presidential elections: end of Turn 8, 16, 24…

* Presidential candidacy requirement: 50 Recognition, and membership in whichever party is 1st or 2nd nationally.

* Player seat rule: each player replaces one NPC Senator in their region and class.

* Bill/amendment votes: lean by spectrum distance from proposer (0/1/2/3 steps → 90/70/30/10%), Rizz bumps one notch, President rolls the same way. Bills: simple majority \+ ⅔ override. Amendments: ¾ majority \+ 4/6 regions \+ Presidential signature, no override.

* Turn Ledger: always output in the fenced “Stat | Target | signed delta | reason” format so it can be pasted into the companion.