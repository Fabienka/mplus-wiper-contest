"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { specsForRole } from "@/lib/wow-specs";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { Notice } from "../../notice";
import { AuthBrand } from "../auth-brand";

/** Minimální délka uživatelského jména - stejná hodnota hlídá i server. */
const MIN_USERNAME_LENGTH = 3;

type SpecRole = "TANK" | "HEALER" | "DPS";

export function RegisterForm() {
  const [season, setSeason] = useState<{ id: string; name: string } | null>(
    null
  );
  const [seasonError, setSeasonError] = useState<string | null>(null);
  // Dokud se sezóna nenačte, formulář se nedá odeslat. Bez tohohle stavu
  // bylo tlačítko zakázané bez vysvětlení.
  const [seasonLoading, setSeasonLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [discordNick, setDiscordNick] = useState("");
  const [raiderioUrl, setRaiderioUrl] = useState("");
  const [specRole, setSpecRole] = useState<SpecRole>("DPS");
  // Prázdné = spec se vezme z Raider.io. Shuffle podle něj počítá ranged/melee,
  // battle rez a bloodlust, takže se vyplatí ho mít správně.
  const [wowSpec, setWowSpec] = useState("");
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
      .catch((err) => setSeasonError(err.message))
      .finally(() => setSeasonLoading(false));
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
          wowSpec: wowSpec || undefined,
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
        <AuthBrand />

        <div className="auth-card">
          <h1>Registrace momentálně není otevřená</h1>
          <Notice kind="info" title={seasonError}>
            Až se sezóna otevře, objeví se odkaz na registraci na úvodní
            stránce.
          </Notice>
          <p className="auth-hint">
            <Link href="/">Zpět na úvodní stránku</Link>
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <AuthBrand />

        <div className="auth-card">
          <h1>Registrace odeslána</h1>
          <Notice kind="success" title="Přihláška dorazila">
            Čeká na schválení adminem. Až ji projde, uvidíš to na svém profilu.
          </Notice>
          <p className="auth-hint">
            Mezitím se můžeš <Link href="/login">přihlásit</Link> a doplnit si
            údaje.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthBrand />

      <form className="auth-card auth-card-wide" onSubmit={handleSubmit}>
        <h1>{season ? `Registrace - ${season.name}` : "Registrace"}</h1>

        {/* Osm polí v jednom sloupci bez členění je stěna. Rozdělení na účet
            a postavu odpovídá tomu, jak se na to lidi ptají. */}
        <fieldset className="field-group">
          <legend>Účet</legend>

          <div className="field">
            <label htmlFor="username">Uživatelské jméno</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={MIN_USERNAME_LENGTH}
              aria-describedby="username-hint"
              required
            />
            <span className="field-hint" id="username-hint">
              Aspoň {MIN_USERNAME_LENGTH} znaky. Přihlašuješ se jím do aplikace,
              nemusí se shodovat se jménem postavy.
            </span>
          </div>

          <div className="field">
            <label htmlFor="password">Heslo</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-hint"
              required
            />
            {/* Požadavek byl dřív jen v minLength, takže se o něm člověk
                dozvěděl až když ho porušil. */}
            <span className="field-hint" id="password-hint">
              Aspoň {MIN_PASSWORD_LENGTH} znaků.
            </span>
          </div>

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-describedby="email-hint"
            />
            <span className="field-hint" id="email-hint">
              Nepovinné. Heslo se přes něj neresetuje - odkaz vydává admin na
              Discordu.
            </span>
          </div>

          <div className="field">
            <label htmlFor="discordNick">Discord nick</label>
            <input
              id="discordNick"
              value={discordNick}
              onChange={(e) => setDiscordNick(e.target.value)}
              aria-describedby="discord-hint"
              required
            />
            <span className="field-hint" id="discord-hint">
              Přes Discord se domlouvají termíny a chodí sem oznámení.
            </span>
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend>Postava</legend>

          <div className="field">
            <label htmlFor="raiderioUrl">Odkaz na Raider.io profil</label>
            <input
              id="raiderioUrl"
              type="url"
              placeholder="https://raider.io/characters/eu/realm/jmeno"
              value={raiderioUrl}
              onChange={(e) => setRaiderioUrl(e.target.value)}
              aria-describedby="raiderio-hint"
              required
            />
            <span className="field-hint" id="raiderio-hint">
              Z profilu se načte jméno, realm, class a RIO skóre.
            </span>
          </div>

          <div className="field">
            <label htmlFor="specRole">Role</label>
            <select
              id="specRole"
              value={specRole}
              onChange={(e) => {
                setSpecRole(e.target.value as SpecRole);
                // Spec patřící k předchozí roli by po přepnutí neseděl.
                setWowSpec("");
              }}
            >
              <option value="TANK">Tank</option>
              <option value="HEALER">Healer</option>
              <option value="DPS">DPS</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="wowSpec">Specializace</label>
            <select
              id="wowSpec"
              value={wowSpec}
              onChange={(e) => setWowSpec(e.target.value)}
              aria-describedby="spec-hint"
            >
              <option value="">Vzít automaticky z Raider.io</option>
              {specsForRole(specRole).map((spec) => (
                <option
                  key={`${spec.className}-${spec.specName}`}
                  value={spec.specName}
                >
                  {spec.className} - {spec.specName}
                </option>
              ))}
            </select>
            <span className="field-hint" id="spec-hint">
              Vyplň, pokud budeš hrát jiný spec, než se kterým tě naposledy
              vidělo Raider.io. Podle specu se skládají týmy.
            </span>
          </div>

          <div className="field">
            <label htmlFor="altCharacter">Alt postava tank/heal</label>
            <input
              id="altCharacter"
              placeholder="Jméno a role"
              value={altCharacter}
              onChange={(e) => setAltCharacter(e.target.value)}
              aria-describedby="alt-hint"
            />
            <span className="field-hint" id="alt-hint">
              Nepovinné, min. ilvl 660. Pomůže při skládání týmů, když bude
              chybět tank nebo healer.
            </span>
          </div>
        </fieldset>

        <div className="field field-check">
          <label>
            <input
              type="checkbox"
              checked={agreedToRules}
              onChange={(e) => setAgreedToRules(e.target.checked)}
            />
            <span>
              Přečetl/a jsem si{" "}
              {/* Odkaz se otevírá do nové karty schválně - odchod ze stránky by
                  vymazal rozepsaný formulář. */}
              <Link href="/info/pravidla" target="_blank" rel="noopener noreferrer">
                pravidla soutěže
              </Link>{" "}
              a souhlasím s nimi
            </span>
          </label>
        </div>

        {/* Chyba nad tlačítkem: na formuláři přes celou obrazovku byla pod ním
            mimo výřez a vypadalo to, že se odesláním nic nestalo. */}
        {error && (
          <div className="auth-notice">
            <Notice kind="error" title={error} />
          </div>
        )}

        <button
          className="primary"
          type="submit"
          disabled={submitting || seasonLoading || !season}
        >
          {submitting
            ? "Odesílám..."
            : seasonLoading
              ? "Načítám sezónu..."
              : "Odeslat registraci"}
        </button>

        <p className="auth-hint">
          Účet už máš? <Link href="/login">Přihlas se</Link>.
        </p>
      </form>
    </div>
  );
}
