/**
 * GTA VI Twitch CCU Forecaster - Turn 1 Entrypoint
 * Autonomous architecture with robust baseline persistence and comparator hook preparation.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ForecastRow {
  hour: number;
  from: string;
  until: string;
}

interface KnownRow {
  hour: number;
  from: string;
  until: string;
  viewers: number;
  channels: number | null;
  reads: number;
}

interface CaseData {
  id: string;
  game: { name: string; twitch_id: string };
  day_start: string;
  checkpoint: string;
  levels: number[];
  known: KnownRow[];
  forecast: ForecastRow[];
  comparables?: Array<{
    name: string;
    day_start: string;
    unlock?: string;
    hourly: Array<{ from: string; viewers: number; channels: number | null }>;
  }>;
}

const TARGET_LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z_QUANTILES = [-1.645, -0.674, 0, 0.674, 1.645];
const BASE_SIGMA = 0.15;

/**
 * Rounds a number to 2 decimal places using half-up arithmetic.
 */
function roundToTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Analyzes comparables to extract median hourly multipliers and spread adjustments (Hook for Turn 2).
 */
function extractComparablePatterns(comparables?: CaseData['comparables']): Map<number, { medianRatio: number; spread: number }> {
  const patterns = new Map<number, { medianRatio: number; spread: number }>();
  if (!comparables || comparables.length === 0) {
    return patterns;
  }
  // Future Turn 2 expansion: compute cross-launch median growth curves relative to hour 1
  return patterns;
}

/**
 * Generates the 5 quantiles for a given forecast hour based on baseline persistence and volatility model.
 */
function calculateHourQuantiles(p1: number, hour: number, _patterns: Map<number, { medianRatio: number; spread: number }>): number[] {
  const sqrtT = Math.sqrt(hour - 1);
  const currentSigma = BASE_SIGMA * sqrtT;
  
  return Z_QUANTILES.map((z) => {
    const rawVal = p1 * Math.exp(z * currentSigma);
    // Ensure bounds: strictly positive and at most 1,000,000,000
    const clamped = Math.max(0.01, Math.min(1000000000, rawVal));
    return roundToTwo(clamped);
  });
}

function runForecaster(): void {
  const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  mkdirSync(outputDir, { recursive: true });

  let caseFiles: string[];
  try {
    caseFiles = readdirSync(inputDir).filter((f) => f.endsWith('.in')).sort();
  } catch (err) {
    console.error(`Failed to read input directory ${inputDir}:`, err);
    process.exit(1);
  }

  for (const file of caseFiles) {
    const filePath = join(inputDir, file);
    let rawContent: string;
    try {
      rawContent = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`Failed to read file ${filePath}:`, err);
      continue;
    }

    let caseData: CaseData;
    try {
      caseData = JSON.parse(rawContent);
    } catch (err) {
      console.error(`Failed to parse JSON for ${file}:`, err);
      continue;
    }

    // Validate levels
    if (caseData.levels.length !== TARGET_LEVELS.length || caseData.levels.some((l, idx) => l !== TARGET_LEVELS[idx])) {
      throw new Error(`Invalid levels in ${file}`);
    }

    const hour1 = caseData.known.find((k) => k.hour === 1);
    if (!hour1) {
      throw new Error(`Missing hour 1 known data in ${file}`);
    }

    const p1 = Math.max(1, hour1.viewers);
    const patterns = extractComparablePatterns(caseData.comparables);

    const hoursOutput = caseData.forecast.map((f) => {
      const qValues = calculateHourQuantiles(p1, f.hour, patterns);
      // Ensure non-decreasing order
      for (let i = 1; i < qValues.length; i++) {
        if (qValues[i] < qValues[i - 1]) {
          qValues[i] = qValues[i - 1];
        }
      }
      return {
        hour: f.hour,
        q: qValues,
      };
    });

    const outputObj = { hours: hoursOutput };
    const outFilename = `${caseData.id || file.slice(0, -3)}.out`;
    const outPath = join(outputDir, outFilename);

    writeFileSync(outPath, JSON.stringify(outputObj) + '\n', 'utf8');
  }
}

runForecaster();
