import { guard3GtoModel } from "./guard3GtoModel";

export const MAX_G_STREAK = 2;

const G_SHORT_META = {
  window: 6,
  expectedGRate: 0.20,
  scale: 25,
  maxShift: 6,
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

function applyGShortageMeta(row, playerActionHistory, emaEnergy, emaGStreak) {
  // ナノカが2連G後でG不可のときは、G不足メタをかけない
  // ここで補正するとFに寄りすぎてハメられやすくなる
  if (emaGStreak >= MAX_G_STREAK) return row;

  if (playerActionHistory.length < 4) return row;

  const recent = playerActionHistory.slice(-G_SHORT_META.window);
  const guardRate =
    recent.filter((action) => action === "G").length / recent.length;

  const shortage = Math.max(0, G_SHORT_META.expectedGRate - guardRate);
  const shift = Math.min(G_SHORT_META.maxShift, shortage * G_SHORT_META.scale);

  if (shift <= 0.01) return row;

  const adjusted = {
    C: row.C ?? 0,
    G: row.G ?? 0,
    F: row.F ?? 0,
    B: row.B ?? 0,
  };

  const addF = emaEnergy >= 1 ? shift * 0.65 : 0;
  const addG = emaGStreak < MAX_G_STREAK ? shift * 0.35 : 0;
  const totalAdd = addF + addG;

  const takeFromC = Math.min(adjusted.C, totalAdd);
  adjusted.C -= takeFromC;

  adjusted.F += addF;
  adjusted.G += addG;

  return normalizeRow(adjusted, emaEnergy, emaGStreak);
}

export function pickEmaAction({
  emaEnergy,
  playerEnergy,
  emaGStreak,
  playerGStreak,
  playerActionHistory,
}) {
  if (emaEnergy >= 6) return "B";

  const key = `${emaEnergy}-${playerEnergy}-${emaGStreak}-${playerGStreak}`;
  const row = guard3GtoModel[key] ?? { C: 34, G: 33, F: 33, B: 0 };

  const normalized = normalizeRow(row, emaEnergy, emaGStreak);
  const adjusted = applyGShortageMeta(
    normalized,
    playerActionHistory,
    emaEnergy,
    emaGStreak
  );

  return pickWeighted(adjusted);
}

export function nextGStreak(current, action) {
  return action === "G" ? Math.min(MAX_G_STREAK, current + 1) : 0;
}