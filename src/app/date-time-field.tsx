"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CZECH_WEEKDAYS_SHORT,
  buildMonthGrid,
  isSameDay,
  mondayFirstIndex,
  monthTitle,
  shiftMonth,
  startOfDay,
  type MonthRef,
} from "@/lib/calendar";
import {
  DEFAULT_TIME,
  TIME_SLOTS,
  formatDayInput,
  formatTimeInput,
  nearestSlotIndex,
  parseDayInput,
  parseTimeInput,
} from "@/lib/datetime-input";

const DAY_ERROR = "Zadej den jako 17. 9. 2026.";
const TIME_ERROR = "Zadej čas jako 19:30.";

/** Událost, kterou pole ohlásí vybraný den - poslouchá ji pole s `dayFallbackFrom`. */
const DAY_EVENT = "datetimefield:day";

type Picker = "day" | "time" | null;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Stejný den v jiném měsíci; 31. se v kratším měsíci srazí na poslední den. */
function sameDayIn({ year, month }: MonthRef, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function monthOf(date: Date): MonthRef {
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Výběr dne a času místo <input type="datetime-local">.
 *
 * Nativní pole šlo nastylovat jen zvenku - vyskakovací kalendář i výběr času
 * kreslí prohlížeč po svém a v každém vypadají jinak (a v Chromu světle
 * i na tmavé stránce). Tady jsou to dvě obyčejná textová pole, každé
 * s vlastní nabídkou v barvách webu:
 *
 * - den se píše jako "17. 9. 2026" nebo vybírá z měsíční mřížky,
 * - čas se píše libovolně ("19:07" projde), nabídka ho ale dává po 15 min.
 *
 * Pole se odesílají jako `<name>Date` a `<name>Time` a server si je skládá
 * přes combineDateTime (src/lib/datetime-input.ts) - bez JavaScriptu tak
 * formulář funguje dál, jen bez nabídek.
 *
 * Inputy jsou schválně neřízené (bez React stavu hodnoty): po odeslání
 * a resetu formuláře se vyprázdní samy, stejně jako dřív ty nativní.
 */
export function DateTimeField({
  id,
  name,
  label,
  required,
  dayFallbackFrom,
  style,
}: {
  id: string;
  /** Základ jména polí - odešlou se `<name>Date` a `<name>Time`. */
  name: string;
  label: string;
  required?: boolean;
  /**
   * Jméno jiného DateTimeField ve stejném formuláři. Když se tam vybere den
   * a tady je den prázdný, převezme se - "Do" je skoro vždy stejný den jako "Od".
   */
  dayFallbackFrom?: string;
  style?: React.CSSProperties;
}) {
  const uid = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** Má se po překreslení přesunout fokus do nabídky? Jen z klávesnice / tlačítka. */
  const focusInside = useRef(false);
  /** Při otevření se nabídka časů vystředí na vybraném čase, pak už jen dorovnává. */
  const centerSlot = useRef(false);

  const [picker, setPicker] = useState<Picker>(null);
  const [view, setView] = useState<MonthRef>(() => monthOf(new Date()));
  const [focusedDay, setFocusedDay] = useState<Date>(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // ---------- Kontrola zápisu ----------

  /** Nastaví hlášku prohlížeče (setCustomValidity) a vrátí přečtený den. */
  const checkDay = (): Date | null => {
    const input = dayRef.current;
    if (!input) return null;

    const parsed = parseDayInput(input.value);
    input.setCustomValidity(input.value.trim() && !parsed ? DAY_ERROR : "");
    return parsed;
  };

  const checkTime = () => {
    const input = timeRef.current;
    if (!input) return null;

    const parsed = parseTimeInput(input.value);
    input.setCustomValidity(input.value.trim() && !parsed ? TIME_ERROR : "");
    return parsed;
  };

  /** Zapíše den do pole a ohlásí ho navázanému poli "Do". */
  const writeDay = (date: Date) => {
    const input = dayRef.current;
    if (!input) return;

    input.value = formatDayInput(date);
    input.setCustomValidity("");
    setSelectedDay(date);
    input.dispatchEvent(new CustomEvent(DAY_EVENT, { detail: input.value }));
  };

  // ---------- Otevírání a zavírání ----------

  const openDay = (moveFocus: boolean) => {
    const selected = checkDay();
    const start = selected ?? startOfDay(new Date());

    setSelectedDay(selected);
    setFocusedDay(start);
    setView(monthOf(start));
    focusInside.current = moveFocus;
    setPicker("day");
  };

  const openTime = (moveFocus: boolean) => {
    const typed = checkTime();

    setSelectedTime(typed ? formatTimeInput(typed) : null);
    setActiveSlot(nearestSlotIndex(typed ?? parseTimeInput(DEFAULT_TIME)!));
    focusInside.current = moveFocus;
    centerSlot.current = true;
    setPicker("time");
  };

  const close = (returnFocus: boolean) => {
    const current = picker;
    setPicker(null);
    focusInside.current = false;

    if (returnFocus) (current === "time" ? timeRef : dayRef).current?.focus();
  };

  const pickDay = (date: Date) => {
    writeDay(date);
    setPicker(null);
    focusInside.current = false;
    // Po dni přichází na řadu čas.
    timeRef.current?.focus();
  };

  const pickTime = (slot: string) => {
    const input = timeRef.current;
    if (!input) return;

    input.value = slot;
    input.setCustomValidity("");
    setSelectedTime(slot);
    close(true);
  };

  // Klik mimo a Escape zavírají, stejně jako u menu a dialogů.
  useEffect(() => {
    if (!picker) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // close čte jen aktuální `picker`, na kterém efekt stejně závisí.
  }, [picker]);

  /** Fokus do nabídky - na zaměřený den mřížky, nebo na seznam časů. */
  const focusPicker = (kind: Picker) => {
    if (kind === "day") {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    }
    if (kind === "time") listRef.current?.focus();
  };

  useEffect(() => {
    if (focusInside.current) focusPicker(picker);
  }, [picker, focusedDay]);

  // Aktivní čas musí být v seznamu vidět. scrollIntoView se nepoužívá,
  // protože by kromě seznamu posunul i celou stránku.
  useEffect(() => {
    if (picker !== "time") return;

    const list = listRef.current;
    const option = list?.children[activeSlot] as HTMLElement | undefined;
    if (!list || !option) return;

    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;

    if (centerSlot.current) {
      centerSlot.current = false;
      list.scrollTop = top - list.clientHeight / 2 + option.offsetHeight / 2;
    } else if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [picker, activeSlot]);

  // "Do" převezme den z "Od", když ho ještě nemá.
  useEffect(() => {
    if (!dayFallbackFrom) return;

    const form = wrapperRef.current?.closest("form");
    const source = form?.elements.namedItem(`${dayFallbackFrom}Date`);
    if (!(source instanceof HTMLInputElement)) return;

    const onDay = (e: Event) => {
      const input = dayRef.current;
      if (!input || input.value.trim()) return;

      input.value = (e as CustomEvent<string>).detail;
      input.setCustomValidity("");
    };

    source.addEventListener(DAY_EVENT, onDay);
    return () => source.removeEventListener(DAY_EVENT, onDay);
  }, [dayFallbackFrom]);

  // ---------- Klávesnice v nabídkách ----------

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    // Enter a mezerník by tlačítko dne spustily i samy, ale jen na
    // zaměřeném prvku - tohle drží výběr na dni, na kterém je fokus mřížky.
    if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLButtonElement) {
      if (!e.target.classList.contains("dtf-day")) return;
      e.preventDefault();
      pickDay(focusedDay);
      return;
    }

    let next: Date | null = null;

    if (e.key in steps) next = addDays(focusedDay, steps[e.key]);
    if (e.key === "PageUp" || e.key === "PageDown") {
      const month = shiftMonth(monthOf(focusedDay), e.key === "PageUp" ? -1 : 1);
      next = sameDayIn(month, focusedDay.getDate());
    }
    if (e.key === "Home") next = addDays(focusedDay, -mondayFirstIndex(focusedDay));
    if (e.key === "End") next = addDays(focusedDay, 6 - mondayFirstIndex(focusedDay));

    if (!next) return;

    e.preventDefault();
    focusInside.current = true;
    setFocusedDay(next);
    setView(monthOf(next));
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const last = TIME_SLOTS.length - 1;
    const steps: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 4,
      PageUp: -4,
    };

    if (e.key in steps) {
      e.preventDefault();
      setActiveSlot((i) => Math.max(0, Math.min(last, i + steps[e.key])));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActiveSlot(e.key === "Home" ? 0 : last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pickTime(TIME_SLOTS[activeSlot]);
    }
  };

  /** Šipka dolů v poli otevře nabídku, jako u nativního výběru. */
  const onInputKeyDown = (kind: "day" | "time") => (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();

    // Nabídka otevřená kliknutím do pole už je vidět, jen v ní není fokus.
    // Znovuotevření by nic nepřekreslilo (stejný stav), a fokus by tak zůstal
    // v poli - proto se do ní rovnou přejde.
    if (picker === kind) {
      focusInside.current = true;
      focusPicker(kind);
      return;
    }

    if (kind === "day") openDay(true);
    else openTime(true);
  };

  // ---------- Vykreslení ----------

  const labelId = `${uid}-label`;
  const dayPopoverId = `${uid}-days`;
  const timePopoverId = `${uid}-times`;
  const today = new Date();

  return (
    <div
      ref={wrapperRef}
      className="field dtf"
      role="group"
      aria-labelledby={labelId}
      style={style}
      // Tabulátorem pryč z pole zavírá nabídku. Při kliknutí mimo je
      // relatedTarget null a řeší to pointerdown výš - jinak by Safari, které
      // tlačítka kliknutím nefokusuje, zavřelo nabídku dřív, než se vybere den.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (picker && next && !wrapperRef.current?.contains(next)) close(false);
      }}
    >
      <label id={labelId} htmlFor={id}>
        {label}
      </label>

      <div className="dtf-inputs">
        <div className="dtf-part dtf-part-day">
          <input
            ref={dayRef}
            id={id}
            name={`${name}Date`}
            required={required}
            placeholder="d. m. rrrr"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label} - den`}
            onClick={() => picker !== "day" && openDay(false)}
            onKeyDown={onInputKeyDown("day")}
            onInput={() => {
              const parsed = checkDay();
              if (picker === "day" && parsed) {
                setSelectedDay(parsed);
                setFocusedDay(parsed);
                setView(monthOf(parsed));
              }
            }}
            onBlur={() => {
              // "17.9" se srovná na "17. 9. 2026", ať je vidět, jak se to přečetlo.
              const parsed = checkDay();
              if (parsed) writeDay(parsed);
            }}
          />
          <button
            type="button"
            className="dtf-toggle"
            aria-label="Vybrat den z kalendáře"
            aria-haspopup="dialog"
            aria-expanded={picker === "day"}
            aria-controls={picker === "day" ? dayPopoverId : undefined}
            onClick={() => (picker === "day" ? close(true) : openDay(true))}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" rx="2" />
              <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
            </svg>
          </button>

          {picker === "day" && (
            <div
              id={dayPopoverId}
              className="dtf-popover dtf-cal"
              role="dialog"
              aria-label={`${label} - výběr dne`}
              tabIndex={-1}
            >
              <div className="dtf-cal-head">
                <button
                  type="button"
                  className="btn dtf-cal-nav"
                  aria-label="Předchozí měsíc"
                  onClick={() => {
                    const month = shiftMonth(view, -1);
                    focusInside.current = false;
                    setView(month);
                    setFocusedDay(sameDayIn(month, focusedDay.getDate()));
                  }}
                >
                  ‹
                </button>
                <strong className="dtf-cal-title" aria-live="polite">
                  {monthTitle(view)}
                </strong>
                <button
                  type="button"
                  className="btn dtf-cal-nav"
                  aria-label="Další měsíc"
                  onClick={() => {
                    const month = shiftMonth(view, 1);
                    focusInside.current = false;
                    setView(month);
                    setFocusedDay(sameDayIn(month, focusedDay.getDate()));
                  }}
                >
                  ›
                </button>
              </div>

              <div className="dtf-cal-grid" ref={gridRef} onKeyDown={onGridKeyDown}>
                {CZECH_WEEKDAYS_SHORT.map((weekday) => (
                  <span key={weekday} className="dtf-cal-weekday" aria-hidden="true">
                    {weekday}
                  </span>
                ))}

                {buildMonthGrid(view.year, view.month, today)
                  .flat()
                  .map((day) => {
                    const selected = selectedDay !== null && isSameDay(day.date, selectedDay);
                    const classes = [
                      "dtf-day",
                      day.isCurrentMonth ? "" : "dtf-day-outside",
                      day.isToday ? "dtf-day-today" : "",
                      selected ? "dtf-day-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <button
                        key={day.date.toISOString()}
                        type="button"
                        className={classes}
                        tabIndex={isSameDay(day.date, focusedDay) ? 0 : -1}
                        aria-pressed={selected}
                        aria-current={day.isToday ? "date" : undefined}
                        aria-label={day.date.toLocaleDateString("cs-CZ", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        onClick={() => pickDay(day.date)}
                      >
                        {day.dayOfMonth}
                      </button>
                    );
                  })}
              </div>

              <div className="dtf-cal-foot">
                <button
                  type="button"
                  className="btn"
                  onClick={() => pickDay(startOfDay(new Date()))}
                >
                  Dnes
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dtf-part dtf-part-time">
          <input
            ref={timeRef}
            name={`${name}Time`}
            required={required}
            placeholder="hh:mm"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label} - čas`}
            onClick={() => picker !== "time" && openTime(false)}
            onKeyDown={onInputKeyDown("time")}
            onInput={() => {
              const parsed = checkTime();
              if (picker === "time" && parsed) {
                setSelectedTime(formatTimeInput(parsed));
                setActiveSlot(nearestSlotIndex(parsed));
              }
            }}
            onBlur={() => {
              const input = timeRef.current;
              const parsed = checkTime();
              if (input && parsed) input.value = formatTimeInput(parsed);
            }}
          />
          <button
            type="button"
            className="dtf-toggle"
            aria-label="Vybrat čas ze seznamu"
            aria-haspopup="listbox"
            aria-expanded={picker === "time"}
            aria-controls={picker === "time" ? timePopoverId : undefined}
            onClick={() => (picker === "time" ? close(true) : openTime(true))}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 4.5V8l2.5 1.5" />
            </svg>
          </button>

          {picker === "time" && (
            <ul
              ref={listRef}
              id={timePopoverId}
              className="dtf-popover dtf-times"
              role="listbox"
              aria-label={`${label} - výběr času`}
              aria-activedescendant={`${uid}-slot-${activeSlot}`}
              tabIndex={0}
              onKeyDown={onListKeyDown}
            >
              {TIME_SLOTS.map((slot, i) => (
                <li
                  key={slot}
                  id={`${uid}-slot-${i}`}
                  role="option"
                  aria-selected={slot === selectedTime}
                  className={[
                    "dtf-time",
                    i === activeSlot ? "dtf-time-active" : "",
                    slot.endsWith(":00") ? "dtf-time-hour" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => pickTime(slot)}
                >
                  {slot}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
