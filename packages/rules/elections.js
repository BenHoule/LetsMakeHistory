function weightedApproval(r) {
    return r.partyApproval * r.regionalModifier;
}
/**
 * Resolve the leading party for a given senate class based on regional party approvals and an optional player's influence.
 * @param regionParties An array of regional party approval records.
 * @param player An optional object representing the player's party and approval rating.
 * @returns The party that is leading in the given senate class, considering the player's influence if provided.
 */
export function resolveSenateClass(regionParties, player) {
    // Sort the regional party approvals by their weighted approval to determine the leading party.
    const sorted = [...regionParties].sort((a, b) => weightedApproval(b) - weightedApproval(a));
    const leader = sorted[0];
    // If the player has influence and is not currently leading, check if their influence can change the outcome.
    if (player && player.party !== leader.party) {
        const playerEntry = regionParties.find(r => r.party === player.party);
        const gap = weightedApproval(leader) - weightedApproval(playerEntry);
        const buffer = 5 + (player.approval - 50);
        if (buffer > gap)
            return player.party;
    }
    return leader.party;
}
/**
 * Resolve the outcome of a presidential election between two nominees based on regional party approvals and modifiers.
 * @param nomineeA The first presidential nominee, including their party and regional stats.
 * @param nomineeB The second presidential nominee, including their party and regional stats.
 * @returns An object containing the winner's party, the electoral vote count for each nominee, and a boolean indicating if the result was determined by a tiebreaker.
 */
export function resolvePresidentialElection(nomineeA, nomineeB) {
    let aElectors = 0, bElectors = 0;
    for (let i = 0; i < nomineeA.regions.length; i++) {
        const aWeighted = nomineeA.regions[i].partyApproval * nomineeA.regions[i].regionalModifier;
        const bWeighted = nomineeB.regions[i].partyApproval * nomineeB.regions[i].regionalModifier;
        if (aWeighted >= bWeighted)
            aElectors++;
        else
            bElectors++;
    }
    if (aElectors !== bElectors) {
        return {
            winner: aElectors > bElectors ? nomineeA.party : nomineeB.party,
            electoralVote: [aElectors, bElectors],
            isTieBreak: false,
        };
    }
    // Tiebreaker: sum weighted approval across all six regions
    const asum = nomineeA.regions.reduce((sum, r) => sum + r.partyApproval * r.regionalModifier, 0);
    const bsum = nomineeB.regions.reduce((sum, r) => sum + r.partyApproval * r.regionalModifier, 0);
    return {
        winner: asum >= bsum ? nomineeA.party : nomineeB.party,
        electoralVote: [aElectors, bElectors],
        isTieBreak: true,
    };
}
