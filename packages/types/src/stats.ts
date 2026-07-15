// Stat and Ledger Typing
export type SizeCategory = 'Small' | 'Medium' | 'Large';
export type StatName = 'Approval' | 'Recognition' | 'Rizz' | 'Party' | 'Region';
export type Party = 'Progressive' | 'Unionist' | 'Whig' | 'Conservative';
export type Region = 'Midwest' | 'Mountain' | 'Northeast' | 'South' | 'Southwest' | 'West';
export const DELTA_TABLE: Record<StatName, [number, number, number]> = {
  Approval:    [0.5, 1.0, 2.0], // Potential stat deltas
  Recognition: [5,   10,  15 ],
  Rizz:        [1,   1,   1  ],
  Party:       [0.5, 1.0, 2.0],
  Region:      [0.05, 0.10, 0.20],
};
export const BOUNDS: Record<StatName, [number, number]> = {
  Approval:    [25,  70      ], // Stat bounds for clamping
  Recognition: [0,   100     ],
  Rizz:        [0,   Infinity],
  Party:       [0,   100     ],
  Region:      [0,   Infinity],
};

/**
 * A single stat change record.
 * @remarks
 * Produced by the Rules Engine and written to the stat_deltas table;
 * also the row format of the Turn Ledger block (Guide v2.1) that
 * Claude outputs for companion import.
 */
export interface StatDeltaRecord {
  stat:        StatName;
  /** Player name, party name, or "Region:Party" for Regional Modifier rows. */
  target:      string;
  /** Signed numeric delta after roll and narrative gating. */
  delta:       number;
  /** One-line in-world justification (required for positive deltas). */
  reason:      string;
  /** Populated by the server; absent when parsed from a raw ledger block. */
  sizeCat?:    SizeCategory;
  sourceType?: string;
  sourceId?:   string;
}

