export const TRIGGER_CHANCE = {
    EVENT: 0.30,
    COURT: 0.20,
    NPC_BILL: 0.30,
    PLAYER_ACTION: 1.00, // player actions always trigger exactly one delta
};
/** Roll to determine if a trigger occurs.
 * @param source The source type of the event.
 * @param rng A random number generator function returning a value between 0 and 1.
 * @returns True if the trigger occurs, false otherwise.
*/
export function rollTrigger(source, rng) {
    return rng() < TRIGGER_CHANCE[source];
}
/**
 * Roll to determine the size category of a stat delta.
 * @param rng A random number generator function returning a value between 0 and 1.
 * @returns The size category rolled ('Small', 'Medium', or 'Large').
 */
export function rollSize(rng) {
    const roll = rng();
    if (roll < 0.60)
        return 'Small';
    if (roll < 0.90)
        return 'Medium';
    return 'Large';
}
/**
 * Roll to determine the direction of a stat delta.
 * @param rng A random number generator function returning a value between 0 and 1.
 * @returns 1 for a positive delta, -1 for a negative delta.
 */
export function rollDirection(rng) {
    return rng() < 0.50 ? 1 : -1;
}
/** NOTE:
 * Each of the three functions above consumes one value from the rng
 * sequence.
 *
 * The Game Service calls them in a fixed order for each source
 * (trigger, then size, then direction), which means the sequence is fully
 * reproducible from the seed. If you ever add a fourth call, or skip the
 * size/direction rolls when the trigger fails, the sequence for subsequent
 * sources in the same turn will shift and the turn can no longer be replayed
 * from seed alone.
 *
 * The safe pattern is: always consume trigger, size, and
 * direction regardless of whether the trigger returned true, and let stats.ts
 * discard the result if the trigger was false.
 */
