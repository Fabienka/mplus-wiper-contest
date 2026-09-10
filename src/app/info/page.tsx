import Link from "next/link";
import { getCurrentSeason } from "@/lib/season";
import { SEASON_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Informace",
};

export default async function InfoPage() {
  const season = await getCurrentSeason();

  return (
    <>
      <h1>Informace</h1>
      <p className="admin-subtitle">
        {season
          ? `${season.name} - ${SEASON_STATUS_LABELS[season.status]}`
          : "Zatím není založená žádná sezóna."}
      </p>

      <div className="card">
        <h2>Jak soutěž probíhá</h2>
        <ol className="info-steps">
          <li>
            Přihlásíš se odkazem na svůj profil na Raider.io a zaplatíš ve hře
            zápisné.
          </li>
          <li>
            Po uzavření registrace se hráči rozdělí do týmů po pěti - jeden
            tank, jeden healer, tři DPS. Tým si nevybíráš.
          </li>
          <li>
            V týmu si zadáte, kdy máte čas. Z překryvů vznikne návrh termínu,
            který schválí moderátor.
          </li>
          <li>
            V termínu odběhnete klíče. Výsledek nahrajete odkazem na běh
            z Raider.io.
          </li>
          <li>
            Počítá se <strong>jediný nejlepší běh</strong>. Podle něj se týmy
            seřadí v žebříčku.
          </li>
        </ol>

        <p className="card-note">
          Přesná pravidla včetně bodování jsou na stránce{" "}
          <Link className="link" href="/info/pravidla">
            Pravidla soutěže
          </Link>
          .
        </p>
      </div>

      <div className="card">
        <h2>Kam dál</h2>
        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          <Link className="btn btn-accent" href="/register">
            Registrace
          </Link>
          <Link className="btn" href="/leaderboard">
            Žebříček
          </Link>
          <Link className="btn" href="/info/kontakt">
            Kontakt
          </Link>
        </div>
      </div>
    </>
  );
}
