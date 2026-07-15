export const DELTA_TABLE = {
    Approval: [0.5, 1.0, 2.0], // Potential stat deltas
    Recognition: [5, 10, 15],
    Rizz: [1, 1, 1],
    Party: [0.5, 1.0, 2.0],
    Region: [0.05, 0.10, 0.20],
};
export const BOUNDS = {
    Approval: [25, 70], // Stat bounds for clamping
    Recognition: [0, 100],
    Rizz: [0, Infinity],
    Party: [0, 100],
    Region: [0, Infinity],
};
