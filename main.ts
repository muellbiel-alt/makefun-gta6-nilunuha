/**
 * GTA VI Twitch CCU Forecaster - v2 Implementation
 * Enhanced log-scale model with filtered comparable diurnal curves and calibrated dispersion.
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

interface HourlyPoint {
  from: string;
  viewers: number;
  channels: number | null;
}

interface Comparable {
  name: string;
  day_start: string;
  unlock?: string;
  hourly: HourlyPoint[];
}

interface CaseData {
  id: string;
  game: { name: string; twitch_id: string };
  day_start: string;
  checkpoint: string;
  levels: number[];
  known: KnownRow[];
  forecast: ForecastRow[];
  comparables?: Comparable[];
}

const TARGET_LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z_QUANTILES = [-1.645, -0.674, 0, 0.674, 1.645];

const EXCLUDED_COMPARABLES = new Set([
  'Hogwarts Legacy', '007 First Light', 'Forza Horizon 6', 'Starfield',
  'Diablo IV', 'Assassin\'s Creed Shadows', 'DOOM: The Dark Ages',
  'Death Stranding 2: On the Beach', 'Forza Horizon 5', 'Marvel Rivals', 'Halo Infinite', 'Marathon'
]);

function roundToTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

function parseIso(isoStr: string): number {
  return new Date(isoStr).getTime();
}

/**
 * Extracts empirical median log-ratios and spreads per hour (2-24) from filtered comparables.
 */
function extractComparablePatterns(comparables?: Comparable[]): Map<number, { ratio: number; spread: number }> {
  const hourData = new Map<number, number[]>();

  if (comparables && comparables.length > 0) {
    const filtered = comparables.filter((c) => !EXCLUDED_COMPARABLES.has(c.name));
    for (const comp of filtered) {
      const dayStart = parseIso(comp.day_start);
      const h1Point = comp.hourly.find((h) => parseIso(h.from) === dayStart);
      if (!h1Point || h1Point.viewers <= 0) continue;
      const p1 = h1Point.viewers;
      const logP1 = Math.log(p1);

      for (let h = 2; h <= 24; h++) {
        const targetTime = dayStart + (h - 1) * 3600000;
        const pt = comp.hourly.find((p) => parseIso(p.from) === targetTime);
        if (pt && pt.viewers > 0) {
          const logRatio = Math.log(pt.viewers) - logP1;
          if (!hourData.has(h)) {
            hourData.set(h, []);
          }
          hourData.get(h)!.push(logRatio);
        }
      }
    }
  }

  const patterns = new Map<number, { ratio: number; spread: number }>();
  for (let h = 2; h <= 24; h++) {
    const vals = hourData.get(h);
    if (vals && vals.length > 0) {
      vals.sort((a, b) => a - b);
      const medianLog = vals[Math.floor(vals.length / 2)];
      const variance = vals.reduce((a, b) => a + Math.pow(b - medianLog, 2), 0) / vals.length;
      const stdDev = Math.sqrt(variance);
      const ratio = Math.max(0.01, Math.min(100, Math.exp(medianLog)));
      const spread = Math.max(0.08, Math.min(3, stdDev * 0.95));
      patterns.set(h, { ratio, spread });
    } else {
      patterns.set(h, { ratio: 1, spread: Math.max(0.08, Math.min(3, 0.15 * Math.sqrt(h - 1))) });
    }
  }

  return patterns;
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
      const pattern = patterns.get(f.hour) ?? { ratio: 1, spread: 0.15 * Math.sqrt(f.hour - 1) };
      const medianVal = p1 * pattern.ratio;
      const sigma = pattern.spread;

      const qValues = Z_QUANTILES.map((z) => {
        const rawVal = medianVal * Math.exp(z * sigma);
        const clamped = Math.max(0.01, Math.min(1000000000, rawVal));
        return roundToTwo(clamped);
      });

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
