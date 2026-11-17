import os, json, math
from datetime import datetime

LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95]
Z = [-1.645, -0.674, 0, 0.674, 1.645]
SIGMA = 0.15
round2 = lambda x: round(x * 100) / 100

def hourQuantiles(p1, h):
    return [round2(p1 * math.exp(z * SIGMA * math.sqrt(h - 1))) for z in Z]

def pinballLoss(y, q, tau):
    d = math.log(y) - math.log(q)
    return 2 * max(tau * d, (tau - 1) * d)

def parse_time(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000

for filename in ['p00.in', 'p01.in', 'p02.in', 'p03.in']:
    path = os.path.join('input', filename)
    if not os.path.exists(path): continue
    data = json.load(open(path))
    totalLoss = 0
    totalHours = 0
    totalMiss = 0
    totalCovered = 0
    for comp in data['comparables']:
        dayStart = parse_time(comp['day_start'])
        h1Point = next((h for h in comp['hourly'] if parse_time(h['from']) == dayStart), None)
        if not h1Point or h1Point['viewers'] <= 0: continue
        p1 = max(1, h1Point['viewers'])
        compLoss = 0
        compCount = 0
        compMiss = 0
        compCovered = 0
        for h in range(2, 25):
            targetTime = dayStart + (h - 1) * 3600 * 1000
            hPoint = next((pt for pt in comp['hourly'] if parse_time(pt['from']) == targetTime), None)
            if not hPoint or hPoint['viewers'] <= 0: continue
            y = hPoint['viewers']
            qs = hourQuantiles(p1, h)
            hourLoss = sum(pinballLoss(y, qs[i], LEVELS[i]) for i in range(5)) / 5
            compLoss += hourLoss
            compMiss += abs(math.log(y) - math.log(qs[2]))
            if qs[0] <= y <= qs[4]:
                compCovered += 1
            compCount += 1
        if compCount > 0:
            totalLoss += compLoss / compCount
            totalMiss += compMiss / compCount
            totalCovered += compCovered / compCount
            totalHours += 1
    if totalHours > 0:
        print(f'{filename} pseudocases ({totalHours} launches) -> Mean Loss: {totalLoss/totalHours:.4f}, Typical Miss: {100*(math.exp(totalMiss/totalHours)-1):.2f}%, Coverage: {100*totalCovered/totalHours:.1f}%')
