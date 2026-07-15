// 32-bit xoshiro128+ -- fast, good statistical quality, reproducible
/**
 * Creates a 32-bit xoshiro128+ pseudo-random number generator (PRNG) with the given seed.
 * @param seed The initial seed for the random number generator.
 * @returns A function that generates a pseudo-random number between 0 and 1 each time it is called.
 */
export function makeRNG(seed) {
    const s = new Uint32Array(4);
    // Seed via splitmix32 so that any single-bit change in `seed` fully
    // diffuses into all four state words before the generator runs.
    // - Uses some nonsense math involving the golden ratio, idk I just copied it
    // from the reference implementation.
    // - Math.imul is required here -- JS `*` uses 64-bit float and silently drops
    // the upper bits of a 32-bit overflow.
    let h = seed >>> 0; // coerces the seed to an unsigned 32-bit int
    function splitmix32() {
        h = (h + 0x9e3779b9) >>> 0;
        let z = h;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
    }
    // each call advances h, so all four state words are independent despite
    // starting from the same seed.
    s[0] = splitmix32();
    s[1] = splitmix32();
    s[2] = splitmix32();
    s[3] = splitmix32();
    // Pathological guard: xoshiro128+ must never start in the all-zero state.
    if ((s[0] | s[1] | s[2] | s[3]) === 0)
        s[0] = 1;
    function rotl(x, k) {
        return (x << k) | (x >>> (32 - k));
    }
    return function () {
        const result = (s[0] + s[3]) >>> 0;
        const t = (s[1] << 9) >>> 0;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = rotl(s[3], 11);
        return result / 0x100000000; // normalize to [0, 1)
    };
}
