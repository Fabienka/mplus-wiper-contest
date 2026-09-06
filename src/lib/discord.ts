import type { Prisma, PrismaClient } from "@prisma/client";
import { buildDiscordMessage, type DiscordEvent } from "./discord-message";

/**
 * Odesílání notifikací na Discord přes incoming webhook.
 *
 * Každá notifikace se nejdřív zapíše do tabulky DiscordEvent a teprve pak
 * odešle. Důvody jsou dva:
 *
 * 1. Zápis jde udělat ve stejné transakci jako změna, která notifikaci
 *    vyvolala. Když transakce spadne, neodejde ani zpráva o něčem, co se
 *    nakonec nestalo.
 * 2. Když Discord zrovna nereaguje, událost zůstane ve stavu PENDING a
 *    doručí ji další běh `npm run discord:notify`. Bez fronty by se ztratila.
 *
 * Odeslání nikdy nesmí shodit akci uživatele - hráč nemá přijít o nahraný
 * běh proto, že má Discord výpadek. Všechny chyby se proto polykají a jen
 * logují, stav zůstane v tabulce.
 */

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Timeout odchozího požadavku. Raider.io se volá bez něj a je to známý problém
 * (visící registrace, viz README) - u Discordu se ta chyba neopakuje.
 */
const SEND_TIMEOUT_MS = 5000;

/** Kolik událostí zpracuje jeden běh flushe. */
const FLUSH_BATCH_SIZE = 50;

export function discordWebhookUrl(): string | null {
  const raw = process.env.DISCORD_WEBHOOK_URL?.trim();
  return raw ? raw : null;
}

export function isDiscordConfigured(): boolean {
  return discordWebhookUrl() !== null;
}

/**
 * Zapíše událost do fronty. Volá se uvnitř transakce té akce, ke které
 * notifikace patří.
 *
 * Bez nastaveného webhooku se nezapisuje nic - jinak by se v dev a v testovací
 * databázi (která má `DISCORD_WEBHOOK_URL` schválně prázdný) hromadily
 * záznamy, které nikdy nikam neodejdou.
 */
export async function enqueueDiscordEvent(
  db: DbClient,
  event: DiscordEvent
): Promise<string | null> {
  if (!isDiscordConfigured()) return null;

  const record = await db.discordEvent.create({
    data: {
      eventType: event.eventType,
      payload: event.payload as unknown as Prisma.InputJsonValue,
    },
  });

  return record.id;
}

export interface SendOutcome {
  ok: boolean;
  /** Chyba, kterou má smysl zkusit znovu (výpadek, timeout, rate limit). */
  retryable: boolean;
  detail: string;
}

/**
 * Jedno HTTP volání webhooku, mimo frontu. Nevyhazuje - výsledek vrací
 * popsaný. Běžné notifikace mají chodit frontou (`enqueueDiscordEvent`);
 * tohle je pro náhled zpráv, který nemá co zapisovat do databáze.
 */
export async function postToWebhook(message: unknown): Promise<SendOutcome> {
  const url = discordWebhookUrl();
  if (!url) return { ok: false, retryable: true, detail: "webhook není nastavený" };

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    // Výpadek sítě i vypršený timeout - obojí má smysl zkusit znovu.
    return {
      ok: false,
      retryable: true,
      detail: err instanceof Error ? err.message : "požadavek se nezdařil",
    };
  }

  if (response.ok) return { ok: true, retryable: false, detail: String(response.status) };

  // 429 je rate limit Discordu, 5xx jejich výpadek - obojí přejde samo.
  // Ostatní 4xx znamenají vadný požadavek; opakování by dopadlo stejně.
  const retryable = response.status === 429 || response.status >= 500;
  const body = await response.text().catch(() => "");

  return {
    ok: false,
    retryable,
    detail: `HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`,
  };
}

/**
 * Jak dopadl pokus o odeslání. Odpovídá stavu, ve kterém událost zůstala:
 * PENDING znamená, že se o ni má další flush pokusit znovu.
 */
export type SendResult = "SENT" | "FAILED" | "PENDING";

/**
 * Zkusí odeslat jednu událost z fronty a zapíše výsledek.
 *
 * Neopakovatelná chyba skončí jako FAILED, opakovatelná nechá záznam v PENDING
 * pro další flush.
 */
export async function sendDiscordEvent(
  prisma: PrismaClient,
  eventId: string
): Promise<SendResult> {
  const record = await prisma.discordEvent.findUnique({ where: { id: eventId } });

  // Chybějící záznam nemá cenu zkoušet znovu - není co odeslat.
  if (!record) return "FAILED";
  if (record.status === "SENT") return "SENT";

  // Payload se do JSON sloupce ukládá přesně v tom tvaru, ve kterém ho
  // vyrobil enqueue, takže se dá bezpečně vrátit zpátky na typ události.
  const event = {
    eventType: record.eventType,
    payload: record.payload,
  } as unknown as DiscordEvent;

  let outcome: SendOutcome;

  try {
    outcome = await postToWebhook(buildDiscordMessage(event));
  } catch (err) {
    // Sem se dostane jen chyba ve skládání zprávy - ta se opakováním nespraví.
    outcome = {
      ok: false,
      retryable: false,
      detail: err instanceof Error ? err.message : "zprávu se nepodařilo složit",
    };
  }

  if (outcome.ok) {
    await prisma.discordEvent.update({
      where: { id: eventId },
      data: { status: "SENT", sentAt: new Date() },
    });
    return "SENT";
  }

  if (!outcome.retryable) {
    await prisma.discordEvent.update({
      where: { id: eventId },
      data: { status: "FAILED" },
    });
  }

  console.error(
    `[discord] ${record.eventType} (${eventId}) neodesláno: ${outcome.detail}` +
      (outcome.retryable ? " - zůstává ve frontě" : " - označeno jako FAILED")
  );

  return outcome.retryable ? "PENDING" : "FAILED";
}

/**
 * Zapsání události mimo transakci: zařadí ji do fronty a hned zkusí odeslat.
 *
 * Pro místa, kde se notifikace posílá až po dokončení akce a není co dalšího
 * zabalit do transakce. Nikdy nevyhazuje.
 */
export async function notifyDiscord(
  prisma: PrismaClient,
  event: DiscordEvent
): Promise<void> {
  try {
    const id = await enqueueDiscordEvent(prisma, event);
    if (id) await sendDiscordEvent(prisma, id);
  } catch (err) {
    console.error("[discord] notifikaci se nepodařilo zpracovat:", err);
  }
}

/**
 * Doručí to, co ve frontě zůstalo (výpadek Discordu, spadlý proces mezi
 * zápisem a odesláním). Pouští se z cronu, viz README.
 */
export async function flushPendingDiscordEvents(
  prisma: PrismaClient,
  limit = FLUSH_BATCH_SIZE
): Promise<{ sent: number; failed: number; pending: number }> {
  if (!isDiscordConfigured()) return { sent: 0, failed: 0, pending: 0 };

  const events = await prisma.discordEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;

  // Postupně, ne paralelně - Discord má na webhook rate limit a dávka
  // odeslaná najednou by se do něj snadno napálila.
  for (const event of events) {
    const result = await sendDiscordEvent(prisma, event.id);
    if (result === "SENT") sent++;
    else if (result === "FAILED") failed++;
  }

  // Ve frontě zůstává jen to, co se má zkusit znovu - trvale odmítnuté
  // události se počítají zvlášť, jinak by hlášení tvrdilo, že se o ně
  // další běh pokusí.
  return { sent, failed, pending: events.length - sent - failed };
}
