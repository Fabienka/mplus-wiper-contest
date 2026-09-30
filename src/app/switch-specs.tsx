import type { SpecRole } from "@prisma/client";
import { SPEC_ROLE_LABELS } from "@/lib/labels";

/**
 * Jestli a na které specy je hráč ochotný switchnout - pro detail hráče
 * v administraci. Specy si hráč vybírá až v profilu, takže "ano" bez speců
 * je běžný stav hned po registraci.
 */
export function SwitchSpecs({
  canSwitchSpec,
  specs,
}: {
  canSwitchSpec: boolean;
  specs: { specName: string; specRole: SpecRole; rioScore: number | null }[];
}) {
  if (!canSwitchSpec) {
    return <>Ne</>;
  }

  if (specs.length === 0) {
    return (
      <>
        Ano <span className="meta">- specy zatím nemá vybrané</span>
      </>
    );
  }

  return (
    <>
      {specs.map((spec) => (
        <div key={spec.specName}>
          {spec.specName}{" "}
          <span className="meta">
            - {SPEC_ROLE_LABELS[spec.specRole]}, RIO{" "}
            {spec.rioScore === null ? "nenačteno" : Math.round(spec.rioScore)}
          </span>
        </div>
      ))}
    </>
  );
}
