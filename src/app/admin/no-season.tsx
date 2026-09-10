/**
 * Prázdný stav administrace, dokud není založená sezóna.
 *
 * Sedm stránek administrace končilo jednou větou v podnadpisu a dvě z nich
 * k tomu rovnou vysypaly `npm run prisma:seed` - příkaz pro vývojáře jako
 * hlavní pokyn na obrazovce, kterou vidí i moderátor bez přístupu k serveru.
 *
 * Sezóna se zatím opravdu z aplikace založit nedá, takže se to říká rovnou
 * a nabízí se jediné, co má smysl: říct si tomu, kdo na server dosáhne.
 * Příkaz zůstává, ale schovaný pod rozklikávacím detailem pro toho, kdo ho
 * skutečně bude pouštět.
 */
export function NoSeason({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="admin-subtitle">Zatím není založená žádná sezóna</p>

      <div className="card">
        <h2>Bez sezóny není co spravovat</h2>
        <p className="card-lead">
          Registrace, týmy i termíny patří vždycky ke konkrétní sezóně. Dokud
          žádná není, nemá tahle stránka co ukázat.
        </p>
        <p className="card-lead">
          Sezónu zatím nejde založit z aplikace - dělá se to na serveru. Když
          k němu nemáš přístup, řekni si adminovi na Discordu.
        </p>

        <details className="notice-detail">
          <summary>Jak ji založit na serveru</summary>
          <pre>npm run prisma:seed</pre>
        </details>
      </div>
    </>
  );
}
