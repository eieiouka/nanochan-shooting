import { guard3GtoModel } from "./guard3GtoModel";

export const MAX_G_STREAK = 2;

const META = {
  window: 10,
  minHistory: 5,
  expected: { C: 0.33, G: 0.33, F: 0.33 },
  scale: 35,
  maxShift: 10,
};

const SPOT_META = {
  minSamples: 2,
  scale: 60,
  maxShift: 25,
};

function normalizeRow(row, emaEnergy, emaGStreak) {
  const legal = Object.entries(row).filter(([action, p]) => {
    if (p <= 0) return false;
    if (action === "F") return emaEnergy >= 1;
    if (action === "B") return emaEnergy >= 6;
    if (action === "G") return emaGStreak < MAX_G_STREAK;
    return true;
  });

  const total = legal.reduce((sum, [, p]) => sum + p, 0);
  if (total <= 0) return { C: 100, G: 0, F: 0, B: 0 };

  return Object.fromEntries(
    legal.map(([action, p]) => [action, (p / total) * 100])
  );
}

function pickWeighted(row) {
  const entries = Object.entries(row);
  const total = entries.reduce((sum, [, p]) => sum + p, 0);
  let r = Math.random() * total;

  for (const [action, p] of entries) {
    r -= p;
    if (r <= 0) return action;
  }

  return entries.at(-1)?.[0] ?? "C";
}

function moveProb(adjusted, from, to, amount) {
  if (amount <= 0) return;

  const take = Math.min(adjusted[from] ?? 0, amount);
  adjusted[from] -= take;
  adjusted[to] = (adjusted[to] ?? 0) + take;
}

function getAction(record) {
  return typeof record === "string" ? record : record?.action;
}

function applyHumanTendencyMeta(row, playerActionHistory, emaEnergy, emaGStreak) {
  if (playerActionHistory.length < META.minHistory) return row;

  const recent = playerActionHistory.slice(-META.window);
  const total = recent.length;

  const rate = {
    C: recent.filter((x) => getAction(x) === "C").length / total,
    G: recent.filter((x) => getAction(x) === "G").length / total,
    F: recent.filter((x) => getAction(x) === "F").length / total,
  };

  const adjusted = {
    C: row.C ?? 0,
    G: row.G ?? 0,
    F: row.F ?? 0,
    B: row.B ?? 0,
  };

  if (emaEnergy >= 1) {
    const cExcess = Math.max(0, rate.C - META.expected.C);
    const shift = Math.min(META.maxShift, cExcess * META.scale);
    moveProb(adjusted, "G", "F", shift * 0.6);
    moveProb(adjusted, "C", "F", shift * 0.4);
  }

  if (emaGStreak < MAX_G_STREAK) {
    const fExcess = Math.max(0, rate.F - META.expected.F);
    const shift = Math.min(META.maxShift, fExcess * META.scale);
    moveProb(adjusted, "C", "G", shift * 0.7);
    moveProb(adjusted, "F", "G", shift * 0.3);
  }

  {
    const gExcess = Math.max(0, rate.G - META.expected.G);
    const shift = Math.min(META.maxShift, gExcess * META.scale);
    moveProb(adjusted, "F", "C", shift * 0.7);
    moveProb(adjusted, "G", "C", shift * 0.3);
  }

  if (emaEnergy >= 1 && emaGStreak < MAX_G_STREAK) {
    const gShortage = Math.max(0, META.expected.G - rate.G);
    const shift = Math.min(6, gShortage * 25);
    moveProb(adjusted, "C", "F", shift * 0.65);
    moveProb(adjusted, "C", "G", shift * 0.35);
  }

  return normalizeRow(adjusted, emaEnergy, emaGStreak);
}

function applySpotExploit(row, playerActionHistory, spotKey, energyKey, emaEnergy, emaGStreak) {
  const spotRecords = playerActionHistory.filter((x) => x?.key === spotKey);
  const energyRecords = playerActionHistory.filter((x) => x?.energyKey === energyKey);

  const records =
    spotRecords.length >= SPOT_META.minSamples ? spotRecords : energyRecords;

  if (records.length < SPOT_META.minSamples) return row;

  const total = records.length;
  const confidence = 1 - Math.exp(-records.length / 6);

  const actualRate = {
    C: records.filter((x) => getAction(x) === "C").length / total,
    G: records.filter((x) => getAction(x) === "G").length / total,
    F: records.filter((x) => getAction(x) === "F").length / total,
  };

  const expectedRow = normalizeRow(
    guard3GtoModel[spotKey] ?? row,
    emaEnergy,
    emaGStreak
  );

  const gtoRate = {
    C: (expectedRow.C ?? 0) / 100,
    G: (expectedRow.G ?? 0) / 100,
    F: (expectedRow.F ?? 0) / 100,
  };

  const gap = {
    C: actualRate.C - gtoRate.C,
    G: actualRate.G - gtoRate.G,
    F: actualRate.F - gtoRate.F,
  };

  const [leakAction, leakValue] = Object.entries(gap).sort(
    ([, a], [, b]) => Math.abs(b) - Math.abs(a)
  )[0];

  const adjusted = {
    C: row.C ?? 0,
    G: row.G ?? 0,
    F: row.F ?? 0,
    B: row.B ?? 0,
  };

  const shift = Math.min(
    SPOT_META.maxShift,
    Math.abs(leakValue) * SPOT_META.scale * confidence
  );

  if (shift <= 0) {
    return normalizeRow(adjusted, emaEnergy, emaGStreak);
  }

  // Cが多すぎる/少なすぎる → Cを狩れるFを増やす
  if (leakAction === "C" && emaEnergy >= 1) {
    moveProb(adjusted, "G", "F", shift * 0.6);
    moveProb(adjusted, "C", "F", shift * 0.4);
  }

  // Fが多すぎる/少なすぎる → Fを受けるGを増やす
  if (leakAction === "F" && emaGStreak < MAX_G_STREAK) {
    moveProb(adjusted, "C", "G", shift * 0.75);
    moveProb(adjusted, "F", "G", shift * 0.25);
  }

  // Gが多すぎる → Cで溜める
  if (leakAction === "G" && leakValue > 0) {
    moveProb(adjusted, "F", "C", shift * 0.75);
    moveProb(adjusted, "G", "C", shift * 0.25);
  }

  // Gが少なすぎる → Fを増やす
  if (leakAction === "G" && leakValue < 0 && emaEnergy >= 1) {
    moveProb(adjusted, "C", "F", shift * 0.75);
    moveProb(adjusted, "G", "F", shift * 0.25);
  }

  return normalizeRow(adjusted, emaEnergy, emaGStreak);
}

export function pickEmaAction({
  emaEnergy,
  playerEnergy,
  emaGStreak,
  playerGStreak,
  playerActionHistory = [],
}) {
  if (emaEnergy >= 6) return "B";

  const key = `${emaEnergy}-${playerEnergy}-${emaGStreak}-${playerGStreak}`;
  const energyKey = `${emaEnergy}-${playerEnergy}`;

  const row = guard3GtoModel[key] ?? { C: 34, G: 33, F: 33, B: 0 };
  const normalized = normalizeRow(row, emaEnergy, emaGStreak);

  const forcedAction = Object.entries(normalized).find(([, p]) => p >= 99.999);
  if (forcedAction) return forcedAction[0];

  const humanAdjusted = applyHumanTendencyMeta(
    normalized,
    playerActionHistory,
    emaEnergy,
    emaGStreak
  );

  const adjusted = applySpotExploit(
    humanAdjusted,
    playerActionHistory,
    key,
    energyKey,
    emaEnergy,
    emaGStreak
  );

  return pickWeighted(adjusted);
}

export function nextGStreak(current, action) {
  return action === "G" ? Math.min(MAX_G_STREAK, current + 1) : 0;
}

export function dumpExploitReport(playerActionHistory = []) {
  const rows = [];

  for (let emaEnergy = 0; emaEnergy <= 6; emaEnergy++) {
    for (let playerEnergy = 0; playerEnergy <= 6; playerEnergy++) {
      const energyKey = `${emaEnergy}-${playerEnergy}`;

      const records = playerActionHistory.filter(
        (x) => x?.energyKey === energyKey
      );

      if (records.length === 0) continue;

      const total = records.length;

      const actual = {
        C: records.filter((x) => getAction(x) === "C").length / total,
        G: records.filter((x) => getAction(x) === "G").length / total,
        F: records.filter((x) => getAction(x) === "F").length / total,
      };

      const gtoRows = [];

      for (let emaG = 0; emaG <= 2; emaG++) {
        for (let playerG = 0; playerG <= 2; playerG++) {
          const key =
            `${emaEnergy}-${playerEnergy}-${emaG}-${playerG}`;

          const row = guard3GtoModel[key];
          if (!row) continue;

          gtoRows.push(
            normalizeRow(row, emaEnergy, emaG)
          );
        }
      }

      const gto = {
        C:
          gtoRows.reduce((s, r) => s + (r.C ?? 0), 0) /
          gtoRows.length /
          100,
        G:
          gtoRows.reduce((s, r) => s + (r.G ?? 0), 0) /
          gtoRows.length /
          100,
        F:
          gtoRows.reduce((s, r) => s + (r.F ?? 0), 0) /
          gtoRows.length /
          100,
      };

      rows.push({
        spot: energyKey,
        samples: total,

        actualC: (actual.C * 100).toFixed(0) + "%",
        actualG: (actual.G * 100).toFixed(0) + "%",
        actualF: (actual.F * 100).toFixed(0) + "%",

        gtoC: (gto.C * 100).toFixed(0) + "%",
        gtoG: (gto.G * 100).toFixed(0) + "%",
        gtoF: (gto.F * 100).toFixed(0) + "%",

        gapC: ((actual.C - gto.C) * 100).toFixed(0) + "%",
        gapG: ((actual.G - gto.G) * 100).toFixed(0) + "%",
        gapF: ((actual.F - gto.F) * 100).toFixed(0) + "%",
      });
    }
  }

  console.table(rows);
}