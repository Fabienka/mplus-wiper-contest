"use client";

import { useEffect, useState } from "react";

type SpecRole = "TANK" | "HEALER" | "DPS";

export default function RegisterPage() {
  const [season, setSeason] = useState<{ id: string; name: string } | null>(
    null
  );
  const [seasonError, setSeasonError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [discordNick, setDiscordNick] = useState("");
  const [raiderioUrl, setRaiderioUrl] = useState("");
  const [specRole, setSpecRole] = useState<SpecRole>("DPS");
  // Zjednodušená verze doplňujících otázek formuláře - v reálné sezóně
  // odpovídá aktuálně platné podobě registračního formuláře (viz use case
  // s alt postavou pro tank/heal switch).
  const [altCharacter, setAltCharacter] = useState("");
  const [agreedToRules, setAgreedToRules] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/seasons/active")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
        return res.json();
      })
      .then(setSeason)
      .catch((err) => setSeasonError(err.message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!season) return;
    if (!agreedToRules) {
      setError("Je nutné potvrdit souhlas s pravidly soutěže.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          email: email || undefined,
          discordNick,
          raiderioUrl,
          specRole,
          seasonId: season.id,
          formAnswers: {
            altCharacter: altCharacter || null,
            agreedToRules,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Registraci se nepodařilo odeslat.");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nastala chyba.");
    } finally {
      setSubmitting(false);
    }
  }

  if (seasonError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Registrace momentálně není otevřená</h1>
          <p className="error-text">{seasonError}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Registrace odeslána</h1>
          <p className="success-text">
            Tvoje přihláška čeká na schválení adminem. O výsledku tě budeme
            informovat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{season ? `Registrace - ${season.name}` : "Registrace"}</h1>

        <div className="field">
          <label htmlFor="username">Uživatelské jméno</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Heslo</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="email">E-mail (nepovinné)</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="discordNick">Discord nick</label>
          <input
            id="discordNick"
            value={discordNick}
            onChange={(e) => setDiscordNick(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="raiderioUrl">Odkaz na Raider.io profil</label>
          <input
            id="raiderioUrl"
            type="url"
            placeholder="https://raider.io/characters/eu/realm/jmeno"
            value={raiderioUrl}
            onChange={(e) => setRaiderioUrl(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="specRole">Role</label>
          <select
            id="specRole"
            value={specRole}
            onChange={(e) => setSpecRole(e.target.value as SpecRole)}
          >
            <option value="TANK">Tank</option>
            <option value="HEALER">Healer</option>
            <option value="DPS">DPS</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="altCharacter">
            Alt postava tank/heal (nepovinné, min. ilvl 660)
          </label>
          <input
            id="altCharacter"
            placeholder="Jméno a role"
            value={altCharacter}
            onChange={(e) => setAltCharacter(e.target.value)}
          />
        </div>

        <div className="field">
          <label style={{ flexDirection: "row", display: "flex", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={agreedToRules}
              onChange={(e) => setAgreedToRules(e.target.checked)}
            />
            Přečetl/a jsem si pravidla soutěže a souhlasím s nimi
          </label>
        </div>

        <button className="primary" type="submit" disabled={submitting || !season}>
          {submitting ? "Odesílám..." : "Odeslat registraci"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
