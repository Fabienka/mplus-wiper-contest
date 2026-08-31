/**
 * Hlášení pro uživatele - úspěch, chyba nebo informace.
 *
 * Volitelný `detail` se schová pod rozklikávací "Detail" a je určený na
 * technický výpis, ze kterého jde chybu dohledat, aniž by musel běžný
 * uživatel koukat na něco nesrozumitelného.
 */
export type NoticeKind = "success" | "error" | "info";

export function Notice({
  kind = "info",
  title,
  children,
  detail,
}: {
  kind?: NoticeKind;
  title: string;
  children?: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <strong className="notice-title">{title}</strong>

      {children && <div className="notice-body">{children}</div>}

      {detail && (
        <details className="notice-detail">
          <summary>Detail chyby</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </div>
  );
}
