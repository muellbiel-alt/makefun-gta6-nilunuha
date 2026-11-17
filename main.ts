/**
 * GTA VI Twitch CCU Forecaster - v1 Implementation
 * Log-scale model with comparable-derived hourly diurnal curves and calibrated dispersion.
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

function roundToTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

function parseIso(isoStr: string): number {
  return new Date(isoStr).getTime();
}

/**
 * Extracts empirical median log-ratios and standard deviations per hour (2-24) from comparables.
 */
function extractComparablePatterns(comparables?: Comparable[]): Map<number, { medianRatio: number; spread: number }> {
  const hourData = new Map<number, number[]>(); // hour -> array of log-ratios (ln(y) - ln(p1))

  if (comparables && comparables.length > 0) {
    for (const comp of comparables) {
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

  const patterns = new Map<number, { medianRatio: number; spread: number }>();
  for (let h = 2; h <= 24; h++) {
    const vals = hourData.get(h);
    if (vals && vals.length > 0) {
      const meanLog = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + Math.pow(b - meanLog, 2), 0) / vals.length;
      const stdDev = Math.sqrt(variance);
      // Calibrate spread to ensure robust 90% coverage (~0.9)
      const spread = Math.max(0.08, stdDev * 1.15);
      patterns.set(h, { medianRatio: meanLog, spread });
    } else {
      const sqrtT = Math.sqrt(h - 1);
      patterns.set(h, { medianRatio: 0, spread: Math.max(0.08, 0.15 * sqrtT) });
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
      const pattern = patterns.get(f.hour) ?? { medianRatio: 0, spread: 0.15 * Math.sqrt(f.hour - 1) };
      const medianVal = p1 * Math.exp(pattern.medianRatio);
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
