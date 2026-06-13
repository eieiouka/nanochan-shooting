import { useMemo, useState } from "react";
import "./App.css";
import { MAX_G_STREAK, nextGStreak, pickEmaAction } from "./ai/aiSelector";
import { audioMixer } from "./audio/audioMixer";

const MAX_LIFE = 10;

const ACTION_LABELS = {
  C: "チャージ",
  G: "ガード",
  F: "ファイア",
  B: "大砲",
};

const ACTION_EFFECTS = {
  C: { icon: "⚡", label: "チャージ", className: "charge" },
  G: { icon: "🛡", label: "ガード", className: "guard" },
  F: { icon: "🔥", label: "ファイア", className: "fire" },
  B: { icon: "💥", label: "大砲", className: "cannon" },
};

function clampEnergy(value) {
  return Math.max(0, Math.min(6, value));
}

function resolveTurn(playerAction, emaAction, playerEnergy, emaEnergy, playerGStreak, emaGStreak) {
  const nextPlayerGStreak = nextGStreak(playerGStreak, playerAction);
  const nextEmaGStreak = nextGStreak(emaGStreak, emaAction);

  if (playerAction === "B" && emaAction === "B") {
    return {
      result: "continue",
      playerEnergy: 0,
      emaEnergy: 0,
      playerGStreak: 0,
      emaGStreak: 0,
      message: "大砲同士が相殺！互いにエネ0へ戻った。",
    };
  }

  if (playerAction === "B") {
    return { result: "playerHit", message: "大砲命中！エマのライフを1削った。" };
  }

  if (emaAction === "B") {
    return { result: "emaHit", message: "エマの大砲が命中！ライフを1失った。" };
  }

  if (playerAction === "F" && emaAction === "C") {
    return { result: "playerHit", message: "ファイア命中！エマのチャージを撃ち抜いた。" };
  }

  if (playerAction === "C" && emaAction === "F") {
    return { result: "emaHit", message: "エマのファイアが命中！チャージを読まれた。" };
  }

  let nextPlayer = playerEnergy;
  let nextEma = emaEnergy;

  if (playerAction === "C") nextPlayer += 1;
  if (emaAction === "C") nextEma += 1;
  if (playerAction === "F") nextPlayer -= 1;
  if (emaAction === "F") nextEma -= 1;

  nextPlayer = clampEnergy(nextPlayer);
  nextEma = clampEnergy(nextEma);

  let message = "読み合い継続。";
  if (playerAction === "F" && emaAction === "G") message = "ファイアはガードされた。";
  if (playerAction === "G" && emaAction === "F") message = "エマのファイアをガードで防いだ。";
  if (playerAction === "F" && emaAction === "F") message = "ファイア同士が相殺。互いにエネ-1。";
  if (playerAction === "C" && emaAction === "C") message = "互いにチャージ。";
  if (playerAction === "G" && emaAction === "G") message = "互いにガード。次の連続G制限に注意。";

  return {
    result: "continue",
    playerEnergy: nextPlayer,
    emaEnergy: nextEma,
    playerGStreak: nextPlayerGStreak,
    emaGStreak: nextEmaGStreak,
    message,
  };
}

function EnergyMeter({ value }) {
  return (
    <div className="energy-meter">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className={`energy-dot ${index < value ? "filled" : ""}`} />
      ))}
    </div>
  );
}

function LifeMeter({ value }) {
  return (
    <div className="life-meter" aria-label={`ライフ ${value}`}>
      {Array.from({ length: MAX_LIFE }).map((_, index) => (
        <span key={index} className={`life-dot ${index < value ? "filled" : ""}`} />
      ))}
    </div>
  );
}

function GuardStreak({ value }) {
  return (
    <p className={`guard-streak ${value >= MAX_G_STREAK ? "locked" : ""}`}>
      連続G {value} / {MAX_G_STREAK}
      {value >= MAX_G_STREAK ? "　次G不可" : ""}
    </p>
  );
}

function ActionEffect({ action }) {
  if (!action) return <div className="action-effect empty">未行動</div>;

  const effect = ACTION_EFFECTS[action];

  return (
    <div className={`action-effect persistent ${effect.className}`}>
      <span className="action-effect-icon">{effect.icon}</span>
      <span className="action-effect-label">{effect.label}</span>
    </div>
  );
}

export default function App() {
  const [playerEnergy, setPlayerEnergy] = useState(0);
  const [emaEnergy, setEmaEnergy] = useState(0);
  const [playerGStreak, setPlayerGStreak] = useState(0);
  const [emaGStreak, setEmaGStreak] = useState(0);
  const [playerLife, setPlayerLife] = useState(MAX_LIFE);
  const [emaLife, setEmaLife] = useState(MAX_LIFE);
  const [turn, setTurn] = useState(1);
  const [history, setHistory] = useState([
    { text: "0-0 / G0-0。10ライフ制、3連続ガード禁止で開始。", type: "system" },
  ]);
  const [lastActions, setLastActions] = useState({ player: null, ema: null });
  const [playerActionHistory, setPlayerActionHistory] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);

  const matchOver = playerLife <= 0 || emaLife <= 0;
  const playerGuardLocked = playerGStreak >= MAX_G_STREAK;

  const statusText = useMemo(() => {
    if (!matchOver) return "10ライフ制。3連続G禁止 + G不足メタ。";
    return playerLife > emaLife ? "勝利。エマを処刑完了。" : "敗北。エマに読み負けた。";
  }, [matchOver, playerLife, emaLife]);

  function addHistory(entry) {
    setHistory((prev) => [entry, ...prev].slice(0, 10));
  }

  function resetRoundState() {
    setPlayerEnergy(0);
    setEmaEnergy(0);
    setPlayerGStreak(0);
    setEmaGStreak(0);
  }

  function damagePlayer() {
    setPlayerLife((value) => Math.max(0, value - 1));
  }

  function damageEma() {
    setEmaLife((value) => Math.max(0, value - 1));
  }

  function play(action) {
    if (matchOver) return;
    if (action === "F" && playerEnergy < 1) return;
    if (action === "B" && playerEnergy < 6) return;
    if (action === "G" && playerGuardLocked) return;

    const emaAction = pickEmaAction({
      emaEnergy,
      playerEnergy,
      emaGStreak,
      playerGStreak,
      playerActionHistory,
    });

    const result = resolveTurn(action, emaAction, playerEnergy, emaEnergy, playerGStreak, emaGStreak);

    setLastActions({ player: action, ema: emaAction });
    setPlayerActionHistory((prev) => [...prev, action].slice(-12));

    const stateLine = `状態 ${emaEnergy}-${playerEnergy} / G${emaGStreak}-${playerGStreak}`;
    const actionLine = `あなた：${ACTION_LABELS[action]} / エマ：${ACTION_LABELS[emaAction]}`;

    if (result.result === "playerHit") {
      damageEma();
      resetRoundState();
      setTurn((value) => value + 1);
      addHistory({ text: `${stateLine}　${actionLine}　${result.message}`, type: "win" });
      return;
    }

    if (result.result === "emaHit") {
      damagePlayer();
      resetRoundState();
      setTurn((value) => value + 1);
      addHistory({ text: `${stateLine}　${actionLine}　${result.message}`, type: "lose" });
      return;
    }

    setPlayerEnergy(result.playerEnergy);
    setEmaEnergy(result.emaEnergy);
    setPlayerGStreak(result.playerGStreak);
    setEmaGStreak(result.emaGStreak);
    addHistory({ text: `${stateLine}　${actionLine}　${result.message}`, type: "normal" });
  }

  function startGame() {
    setGameStarted(true);

    audioMixer.playBgm("/sounds/bgm.mp3");
  }

  function resetGame() {
    resetRoundState();
    setPlayerLife(MAX_LIFE);
    setEmaLife(MAX_LIFE);
    setTurn(1);
    setLastActions({ player: null, ema: null });
    setPlayerActionHistory([]);
    setHistory([{ text: "0-0 / G0-0。10ライフ制、3連続ガード禁止で開始。", type: "system" }]);
  }

  if (!gameStarted) {
    return (
      <main className="app">
        <section className="result-panel clear">
          <h1>6連リロードで桜羽エマを倒そう</h1>

          <p>
            チャージ、ガード、ファイア、大砲。
            <br />
            10ライフ制。
            <br />
            3連続ガードは禁止。
          </p>

          <button onClick={startGame}>
            ゲームスタート
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="title-block">
          <p className="eyebrow">ema-shokei</p>
          <h1>6連リロードで桜羽エマを倒そう</h1>
          <p className="description">
            チャージ、ガード、ファイア、大砲。10ライフ制。3連続ガードは禁止。
          </p>
        </div>

        <div className="score-card">
          <span>Turn</span>
          <strong>{turn}</strong>
          <small>{statusText}</small>
        </div>
      </section>

      <section className="scoreboard life-scoreboard">
        <div className="score-number player">{playerLife}</div>
        <div className="score-label">あなた</div>
        <div className="score-separator">-</div>
        <div className="score-label">桜羽エマ</div>
        <div className="score-number ema">{emaLife}</div>
      </section>

      <section className="battle-board">
        <article className="fighter player-card">
          <div className="avatar-wrap">
            <div className="avatar player-avatar">YOU</div>
            <ActionEffect action={lastActions.player} />
          </div>
          <h2>あなた</h2>
          <LifeMeter value={playerLife} />
          <p className="energy-text">ライフ {playerLife} / {MAX_LIFE}</p>
          <EnergyMeter value={playerEnergy} />
          <p className="energy-text">エネ {playerEnergy} / 6</p>
          <GuardStreak value={playerGStreak} />
        </article>

        <div className="center-panel">
          <div className="versus">VS</div>
          <div className="rule-chip">10ライフ制</div>
          <div className="rule-chip">Gは最大2連続</div>
          <div className="rule-chip">G2後はG不可</div>
          <div className="rule-chip">Bは6エネ</div>
          <div className="rule-chip">G不足なら少しメタ</div>
        </div>

        <article className="fighter ema-card">
          <div className="avatar-wrap">
            <div className="avatar ema-avatar">EMA</div>
            <ActionEffect action={lastActions.ema} />
          </div>
          <h2>桜羽エマ</h2>
          <LifeMeter value={emaLife} />
          <p className="energy-text">ライフ {emaLife} / {MAX_LIFE}</p>
          <EnergyMeter value={emaEnergy} />
          <p className="energy-text">エネ {emaEnergy} / 6</p>
          <GuardStreak value={emaGStreak} />
        </article>
      </section>

      <section className="controls">
        <button className="action-button charge" disabled={matchOver} onClick={() => play("C")}>
          <span className="action-name">チャージ</span>
          <span className="action-sub">エネ+1</span>
        </button>

        <button className="action-button guard" disabled={matchOver || playerGuardLocked} onClick={() => play("G")}>
          <span className="action-name">ガード</span>
          <span className="action-sub">{playerGuardLocked ? "3連続禁止" : "防御"}</span>
        </button>

        <button className="action-button fire" disabled={matchOver || playerEnergy < 1} onClick={() => play("F")}>
          <span className="action-name">ファイア</span>
          <span className="action-sub">1エネ消費</span>
        </button>

        <button className="action-button cannon" disabled={matchOver || playerEnergy < 6} onClick={() => play("B")}>
          <span className="action-name">大砲</span>
          <span className="action-sub">6エネ</span>
        </button>
      </section>

      {matchOver && (
        <section className={`result-panel ${playerLife > emaLife ? "clear" : "bad"}`}>
          <h2>{playerLife > emaLife ? "勝利" : "敗北"}</h2>
          <p>あなた {playerLife} - {emaLife} エマ</p>
          <button onClick={resetGame}>もう一度</button>
        </section>
      )}

      <section className="history">
        <h2>ログ</h2>
        <div className="history-list">
          {history.map((item, index) => (
            <p key={`${item.text}-${index}`} className={`history-item ${item.type}`}>
              {item.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
