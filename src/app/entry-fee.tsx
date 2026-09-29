import { ENTRY_FEE_AMOUNT, ENTRY_FEE_RECIPIENT } from "@/lib/contest-info";

/**
 * Kolik a komu poslat zápisné, jednou větou. Stejný text v pravidlech, na
 * přihlášce i v profilu, ať se to na třech místech nerozejde. Bez částky nebo
 * příjemce nevypíše nic.
 */
export function EntryFeeLine() {
  if (!ENTRY_FEE_AMOUNT || !ENTRY_FEE_RECIPIENT) return null;

  return (
    <>
      Zápisné je <strong>{ENTRY_FEE_AMOUNT}</strong>, pošli ho ve hře postavě{" "}
      <strong>{ENTRY_FEE_RECIPIENT}</strong>.
    </>
  );
}
