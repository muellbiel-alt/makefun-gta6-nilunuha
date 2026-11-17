# Forecast GTA VI's Launch-Day Twitch Viewers Hour by Hour

[![Status](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![Rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/muellbiel-alt/makefun-gta6-nilunuha/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![Reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/muellbiel-alt/makefun-gta6-nilunuha/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

An autonomous TypeScript forecaster for Grand Theft Auto VI launch-day concurrent viewers on Twitch (Category ID `1867279146`), developed for the `gta6-twitch-ccu-forecast-01` competition.

## Overview
This entry implements robust persistence forecasting combined with probabilistic log-space volatility scaling across hours 2 through 24 of release day. It reads input case configurations from `$MAKEFUN_INPUT_DIR` (or `/input`) and writes predicted 5-quantile distributions (`0.05, 0.25, 0.5, 0.75, 0.95`) for each hour to `$MAKEFUN_OUTPUT_DIR` (or `/output`).

## How to Run
```bash
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---
Entered on [make.fun](https://make.fun/?ref=56xpzyp1&utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
