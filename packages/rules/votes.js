export const SPECTRUM = ['Progressive', 'Unionist', 'Whig', 'Conservative'];
/**
 * Calculate the distance between two parties on the political spectrum.
 * @param a The first party.
 * @param b The second party.
 * @returns The distance between the two parties, as 0, 1, 2, or 3.
 */
export function spectrumDistance(a, b) {
    const indexA = SPECTRUM.indexOf(a);
    const indexB = SPECTRUM.indexOf(b);
    return Math.abs(indexA - indexB);
}
const LEAN_PROB = {
    0: 0.90,
    1: 0.70,
    2: 0.30,
    3: 0.10,
};
const PROB_LADDER = [0.10, 0.30, 0.50, 0.70, 0.90];
/**
 * Apply the "Rizz" effect to a given probability value, increasing it to the next higher step on the probability ladder.
 * @param prob The current probability value.
 * @returns The adjusted probability after applying the "Rizz" effect.
 */
export function applyRizz(prob) {
    const idx = PROB_LADDER.indexOf(prob);
    if (idx === -1)
        return prob;
    return PROB_LADDER[Math.min(idx + 1, PROB_LADDER.length - 1)];
}
/**
 * Simulate a single vote for a legislative seat based on party alignment and the "Rizz" effect.
 * @param voterParty The party of the voter.
 * @param proposerParty The party of the proposer.
 * @param rizzSpent Whether the "Rizz" effect was spent on this vote.
 * @param rng A random number generator function returning a value between 0 and 1.
 * @returns 'YEA' if the vote is in favor, 'NAY' otherwise.
 */
export function rollSeat(voterParty, proposerParty, rizzSpent, rng) {
    const distance = spectrumDistance(voterParty, proposerParty);
    let prob = LEAN_PROB[distance];
    if (rizzSpent)
        prob = applyRizz(prob);
    return rng() < prob ? 'YEA' : 'NAY';
}
/**
 * Determine if a bill passes based on the number of 'YEA' and 'NAY' votes.
 * @param yeas The number of 'YEA' votes.
 * @param nays The number of 'NAY' votes.
 * @returns True if the bill passes (more 'YEA' than 'NAY'), false otherwise.
 */
export function billPasses(yeas, nays) {
    return yeas > nays;
}
/**
 * Determine if a veto override passes based on the number of 'YEA' and 'NAY' votes.
 * @param yeas The number of 'YEA' votes.
 * @param nays The number of 'NAY' votes.
 * @returns True if the veto override passes (more than two-thirds 'YEA'), false otherwise.
 */
export function vetoOverridePasses(yeas, nays) {
    return (yeas / (yeas + nays)) > (2 / 3);
}
/**
 * Determine if an amendment passes based on overall and regional support.
 * @param yeas The number of 'YEA' votes overall.
 * @param nays The number of 'NAY' votes overall.
 * @param regionResults An array of regional vote results, each containing 'yeas' and 'nays'.
 * @returns True if the amendment passes (overall 'YEA' fraction > 0.75 and at least 4 regions with more 'YEA' than 'NAY'), false otherwise.
 */
export function amendmentPasses(yeas, nays, regionResults) {
    const overallFrac = yeas / (yeas + nays);
    const qualifyingRegions = regionResults.filter(r => r.yeas > r.nays).length;
    return overallFrac > 0.75 && qualifyingRegions >= 4;
}
