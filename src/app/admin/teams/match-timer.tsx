"use client";

import { useEffect, useState } from "react";
import { SubmitButton } from "../../submit-button";
import {
  TIMER_TOLERANCE_SECONDS,
  formatClock,
  timerCheck,
  timerElapsedSeconds,
} from "@/lib/match-timer";
import { formatPlayTime } from "@/lib/time-budget";

type Action = (formData: FormData) => void | Promise<void>;

/**
 * Časovač herního času zápasu na detailu týmu - pro admina a moderátora.
 *
 * Ukazuje, kolik herního času týmu zbývá, a hlídá, jestli naměřený čas sedí
 * na součet zapsaných běhů (tolerance TIMER_TOLERANCE_SECONDS včetně).
 *
 * Stav drží server u zápasu - spuštění a pozastavení jdou přes server
 * action, tady se jen každou půlsekundu dopočítává běžící úsek. Hodiny
 * prohlížeče se srovnávají se serverem (serverNow), jinak by u člověka se
 * špatně nastaveným časem ukazoval nesmysl.
 */
export function MatchTimer({
  matchId,
  teamId,
  limitSeconds,
  elapsedSeconds,
  runningSince,
  recordedSeconds,
  serverNow,
  startAction,
  pauseAction,
  resetAction,
}: {
  matchId: string;
  teamId: string;
  limitSeconds: number;
  /** Naměřený čas z dřívějších úseků. */
  elapsedSeconds: number;
  /** Začátek právě běžícího úseku (ISO), null = pozastaveno. */
  runningSince: string | null;
  /** Součet časů zapsaných běhů zápasu. */
  recordedSeconds: number;
  /** Čas serveru při vykreslení (ISO). */
  serverNow: string;
  startAction: Action;
  pauseAction: Action;
  resetAction: Action;
}) {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const running = runningSince !== null;

  useEffect(() => {
    if (!running) return;

    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [running, offset]);

  const elapsed = timerElapsedSeconds(
    { elapsedSeconds, runningSince: runningSince ? new Date(runningSince) : null },
    new Date(now)
  );
  const remaining = limitSeconds - elapsed;
  const check = timerCheck({ elapsedSeconds: elapsed, recordedSeconds, running });

  const classes = [
    "match-timer",
    running ? "match-timer-running" : "",
    remaining < 0 ? "match-timer-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hidden = (
    <>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamId" value={teamId} />
    </>
  );

  return (
    <div className={classes}>
      <div>
        <div className="match-timer-label">
          {running ? "Časovač běží - zbývá" : elapsed === 0 ? "Časovač - zbývá" : "Pozastaveno - zbývá"}
        </div>
        <div className="match-timer-clock" aria-label={`Zbývá ${formatPlayTime(Math.max(0, remaining))}`}>
          {formatClock(remaining)}
        </div>
        <div className="match-timer-meta">
          Uplynulo {formatClock(elapsed)} · zapsané běhy {formatClock(recordedSeconds)}
        </div>
      </div>

      <div className="match-timer-actions">
        {running ? (
          <form action={pauseAction}>
            {hidden}
            <SubmitButton className="btn btn-accent" pendingLabel="Pozastavuji...">
              Pozastavit
            </SubmitButton>
          </form>
        ) : (
          <form action={startAction}>
            {hidden}
            <SubmitButton className="btn btn-accent" pendingLabel="Spouštím...">
              {elapsed === 0 ? "Spustit časovač" : "Pokračovat"}
            </SubmitButton>
          </form>
        )}

        {(elapsed > 0 || running) && (
          <form action={resetAction}>
            {hidden}
            <SubmitButton
              className="btn"
              pendingLabel="Nuluji..."
              confirmTitle="Vynulovat časovač?"
              confirm="Naměřený čas se zahodí a časovač začne znovu od plného limitu. Zapsané běhy zůstanou."
              confirmLabel="Vynulovat"
            >
              Vynulovat
            </SubmitButton>
          </form>
        )}
      </div>

      {check.kind === "missing" && (
        <p className="match-timer-alert">
          <strong>Čas nesedí.</strong> Časovač naměřil o{" "}
          {formatPlayTime(check.diffSeconds)} víc, než dávají zapsané běhy. Buď je
          potřeba přidat běh, nebo ověřit časy. Povolený rozdíl je{" "}
          {TIMER_TOLERANCE_SECONDS} s.
        </p>
      )}

      {check.kind === "excess" && (
        <p className="match-timer-alert">
          <strong>Čas nesedí.</strong> Zapsané běhy dávají o{" "}
          {formatPlayTime(check.diffSeconds)} víc, než naměřil časovač. Ověř časy
          běhů. Povolený rozdíl je {TIMER_TOLERANCE_SECONDS} s.
        </p>
      )}
    </div>
  );
}
