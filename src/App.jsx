import { useState } from "react";
import "./App.css";
import { MAX_G_STREAK, nextGStreak, pickEmaAction } from "./ai/aiSelector";
import { audioMixer } from "./audio/audioMixer";

const MAX_LIFE = 10;

const NANOKA_MOVIES = {
  C: "/movies/nanoka_charge.mp4",
  G: "/movies/nanoka_guard.mp4",
  F: "/movies/nanoka_fire.mp4",
  B: "/movies/nanoka_blast.mp4",

  FIRE_FIRE: "/movies/nanoka_fire_fire.mp4",
  GUARD_NOTHING: "/movies/nanoka_guard_nothing.mp4",

  CHARGE_GUARD: "/movies/nanoka_charge_guard.mp4",
  GUARD_GUARD: "/movies/nanoka_guard_guard.mp4",
  FIRE_GUARD: "/movies/nanoka_fire_guard.mp4",

  CHARGE_FIRE: "/movies/nanoka_charge_fire.mp4",
  GUARD_FIRE: "/movies/nanoka_guard_fire.mp4",
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
    };
  }

  if (playerAction === "B") return { result: "playerHit" };
  if (emaAction === "B") return { result: "emaHit" };

  if (playerAction === "F" && emaAction === "C") return { result: "playerHit" };
  if (playerAction === "C" && emaAction === "F") return { result: "emaHit" };

  let nextPlayer = playerEnergy;
  let nextEma = emaEnergy;

  if (playerAction === "C") nextPlayer += 1;
  if (emaAction === "C") nextEma += 1;
  if (playerAction === "F") nextPlayer -= 1;
  if (emaAction === "F") nextEma -= 1;

  return {
    result: "continue",
    playerEnergy: clampEnergy(nextPlayer),
    emaEnergy: clampEnergy(nextEma),
    playerGStreak: nextPlayerGStreak,
    emaGStreak: nextEmaGStreak,
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
  const [lastActions, setLastActions] = useState({ player: null, ema: null });
  const [playerActionHistory, setPlayerActionHistory] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [nanokaMovie, setNanokaMovie] = useState(null);
  const [pendingTurn, setPendingTurn] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const matchOver = playerLife <= 0 || emaLife <= 0;
  const playerGuardLocked = playerGStreak >= MAX_G_STREAK;

  function resetRoundState() {
    setPlayerEnergy(0);
    setEmaEnergy(0);
    setPlayerGStreak(0);
    setEmaGStreak(0);
  }

  function finishTurn() {
    if (!pendingTurn) return;

    const { action, emaAction, result } = pendingTurn;

    setLastActions({ player: action, ema: emaAction });
    setPlayerActionHistory((prev) => [...prev, action].slice(-12));

    if (result.result === "playerHit") {
      setEmaLife((value) => Math.max(0, value - 1));
      resetRoundState();
      setTurn((value) => value + 1);
    } else if (result.result === "emaHit") {
      setPlayerLife((value) => Math.max(0, value - 1));
      resetRoundState();
      setTurn((value) => value + 1);
    } else {
      setPlayerEnergy(result.playerEnergy);
      setEmaEnergy(result.emaEnergy);
      setPlayerGStreak(result.playerGStreak);
      setEmaGStreak(result.emaGStreak);
    }

    setPendingTurn(null);
    setNanokaMovie(null);
    setIsAnimating(false);
  }

  function chooseNanokaMovie(action, emaAction) {
    let movie = NANOKA_MOVIES[emaAction];

    if (action === "F") {
      if (emaAction === "C") movie = NANOKA_MOVIES.CHARGE_FIRE;
      else if (emaAction === "G") movie = NANOKA_MOVIES.GUARD_FIRE;
      else if (emaAction === "F") movie = NANOKA_MOVIES.FIRE_FIRE;
      else if (emaAction === "B") movie = NANOKA_MOVIES.B;
    } else if (action === "G") {
      if (emaAction === "C") movie = NANOKA_MOVIES.CHARGE_GUARD;
      else if (emaAction === "G") movie = NANOKA_MOVIES.GUARD_GUARD;
      else if (emaAction === "F") movie = NANOKA_MOVIES.FIRE_GUARD;
      else if (emaAction === "B") movie = NANOKA_MOVIES.B;
    } else if (emaAction === "G") {
      movie = NANOKA_MOVIES.GUARD_NOTHING;
    }

    return movie;
  }

  function play(action) {
    if (matchOver) return;
    if (isAnimating) return;
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

    const result = resolveTurn(
      action,
      emaAction,
      playerEnergy,
      emaEnergy,
      playerGStreak,
      emaGStreak
    );

    setPendingTurn({ action, emaAction, result });
    setNanokaMovie(chooseNanokaMovie(action, emaAction));
    setIsAnimating(true);
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
    setPendingTurn(null);
    setNanokaMovie(null);
    setIsAnimating(false);
  }

  if (!gameStarted) {
    return (
      <main className="app">
        <section className="result-panel clear">
          <h1>黒部ナノカを倒そう</h1>

          <p>
            チャージでエネルギーを溜め、
            <br />
            攻撃を当てて10ライフを削り切れ。
          </p>

          <button onClick={startGame}>ゲームスタート</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      {nanokaMovie && (
        <video
          className="nanoka-movie-bg"
          src={nanokaMovie}
          autoPlay
          playsInline
          onEnded={finishTurn}
          onError={finishTurn}
        />
      )}

      <section className="scoreboard life-scoreboard">
        <div className="score-number player">{playerLife}</div>
        <div className="score-label">あなた</div>
        <div className="score-separator">-</div>
        <div className="score-label">黒部ナノカ</div>
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
        </div>

        <article className="fighter ema-card">
          <div className="avatar-wrap">
            <div className="avatar ema-avatar">NANOKA</div>
            <ActionEffect action={lastActions.ema} />
          </div>

          <h2>黒部ナノカ</h2>

          <LifeMeter value={emaLife} />
          <p className="energy-text">ライフ {emaLife} / {MAX_LIFE}</p>

          <EnergyMeter value={emaEnergy} />
          <p className="energy-text">エネ {emaEnergy} / 6</p>

          <GuardStreak value={emaGStreak} />
        </article>
      </section>

      <section className="controls">
        <button
          className="action-button charge"
          disabled={matchOver || isAnimating || playerEnergy >= 6}
          onClick={() => play("C")}
        >
          <span className="action-name">装填する</span>
        </button>

        <button
          className="action-button guard"
          disabled={matchOver || isAnimating || playerGuardLocked}
          onClick={() => play("G")}
        >
          <span className="action-name">躱す</span>
        </button>

        <button
          className={`action-button ${playerEnergy >= 6 ? "cannon" : "fire"}`}
          disabled={matchOver || isAnimating || playerEnergy < 1}
          onClick={() => play(playerEnergy >= 6 ? "B" : "F")}
        >
          <span className="action-name">
            {playerEnergy >= 6 ? "連射する" : "撃つ"}
          </span>
        </button>
      </section>

      {matchOver && (
        <section className={`result-panel ${playerLife > emaLife ? "clear" : "bad"}`}>
          <h2>{playerLife > emaLife ? "勝利" : "敗北"}</h2>
          <p>
            あなた {playerLife} - {emaLife} ナノカ
          </p>
          <button onClick={resetGame}>もう一度</button>
        </section>
      )}
    </main>
  );
}