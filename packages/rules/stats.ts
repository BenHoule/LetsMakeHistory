// Functions for calculating stat deltas based on size categories and bounds.
import { DELTA_TABLE, BOUNDS } from '@lmh/types';
import type { StatName, SizeCategory, StatDeltaRecord } from '@lmh/types';

/**
 * Calculate the numeric delta for a given stat delta record based on its size category.
 * @param record The stat delta record containing the stat and size category.
 * @param direction The direction of the delta, 1 for positive and -1 for negative.
 * @returns The numeric delta corresponding to the size category, or 0 if size category is not specified.
 */
export function calculateStatDelta(
  record: StatDeltaRecord,
  direction: 1 | -1
): number {
  const { stat, sizeCat } = record;
  if (!sizeCat) return 0;
  const deltaValues = DELTA_TABLE[stat];
  direction = (stat === 'Rizz' ? 1 : direction);
  switch (sizeCat) {
    case 'Small':  return deltaValues[0] * direction;
    case 'Medium': return deltaValues[1] * direction;
    case 'Large':  return deltaValues[2] * direction;
    default: return 0;
  }
}

/**
 * Clamp a stat value within its defined bounds after applying a delta.
 * @param stat The name of the stat to clamp.
 * @param current The current value of the stat.
 * @param delta The proposed change to the stat.
 * @returns The clamped value of the stat after applying the delta.
 */
export function clampStat(
  stat: StatName,
  current: number,
  delta: number
): number {
  const [min, max] = BOUNDS[stat];
  return Math.min(Math.max(current + delta, min), max);
}
