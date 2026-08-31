import Link from "next/link";
import {
  CZECH_WEEKDAYS_SHORT,
  buildMonthGrid,
  eventsForDay,
  formatDayParam,
  formatMonthParam,
  isSameDay,
  monthTitle,
  parseDayParam,
  shiftMonth,
  startOfDay,
  type CalendarEvent,
  type MonthRef,
} from "@/lib/calendar";
import { formatDuration, plural } from "@/lib/labels";

/** Kolik událostí se vejde do buňky, než se zbytek schová pod "+N dalších". */
const MAX_EVENTS_PER_DAY = 3;

const KIND_CLASS: Record<CalendarEvent["kind"], string> = {
  MATCH_CONFIRMED: "cal-event cal-kind-confirmed",
  MATCH_PROPOSED: "cal-event cal-kind-proposed",
  OVERLAP: "cal-event cal-kind-overlap",
  AVAILABILITY: "cal-event cal-kind-availability",
};

/** Čtvereček v legendě - jen barva, ne celá událost. */
const KIND_SWATCH: Record<CalendarEvent["kind"], string> = {
  MATCH_CONFIRMED: "cal-swatch cal-kind-confirmed",
  MATCH_PROPOSED: "cal-swatch cal-kind-proposed",
  OVERLAP: "cal-swatch cal-kind-overlap",
  AVAILABILITY: "cal-swatch cal-kind-availability",
};

/** Popisek druhu v detailu dne, když ho stránka nemá ve své legendě. */
const KIND_FALLBACK_LABEL: Record<CalendarEvent["kind"], string> = {
  MATCH_CONFIRMED: "schválený termín",
  MATCH_PROPOSED: "navržený termín",
  OVERLAP: "může celý tým",
  AVAILABILITY: "zadaný čas",
};

function hhmm(date: Date): string {
  return date.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function startsOn(event: CalendarEvent, day: Date): boolean {
  return event.start >= startOfDay(day);
}

function endsOn(event: CalendarEvent, day: Date): boolean {
  const dayEnd = startOfDay(day);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return event.end <= dayEnd;
}

function timeLabel(event: CalendarEvent, day: Date): string {
  // U úseku přes půlnoc by "00:00" mátlo, proto se u navazujícího dne
  // ukazuje šipka místo času.
  return startsOn(event, day) ? hhmm(event.start) : "→";
}

/** Časy v detailu dne; šipka značí, že úsek přesahuje do sousedního dne. */
function dayRangeLabel(event: CalendarEvent, day: Date): string {
  const from = startsOn(event, day) ? hhmm(event.start) : `← ${hhmm(event.start)}`;
  const to = endsOn(event, day) ? hhmm(event.end) : `${hhmm(event.end)} →`;
  return `${from} - ${to}`;
}

export interface MonthCalendarProps {
  month: MonthRef;
  events: CalendarEvent[];
  /** Cesta, na kterou míří šipky měsíců (měsíc se předává v ?month=). */
  basePath: string;
  /** Ostatní parametry v URL, které mají listování přežít (např. filtr). */
  keepParams?: Record<string, string | undefined>;
  legend?: { kind: CalendarEvent["kind"]; label: string }[];
  /** Rozkliknutý den jako "2026-09-14" (z ?day=). */
  selectedDay?: string;
}

/**
 * Měsíční kalendář - server komponenta. Listování měsíců i rozkliknutí dne jde
 * přes odkazy s ?month= a ?day=, takže to funguje i bez JavaScriptu a dá se
 * poslat odkazem na konkrétní den.
 */
export function MonthCalendar({
  month,
  events,
  basePath,
  keepParams = {},
  legend = [],
  selectedDay,
}: MonthCalendarProps) {
  const weeks = buildMonthGrid(month.year, month.month);
  const selectedDate = parseDayParam(selectedDay);

  const buildHref = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keepParams, ...params })) {
      if (value) search.set(key, value);
    }
    return `${basePath}?${search}`;
  };

  // Přepnutí měsíce vybraný den zahazuje - jinak by pod mřížkou zůstal viset
  // detail dne, který v novém měsíci není vidět.
  const hrefForMonth = (target: MonthRef) =>
    buildHref({ month: formatMonthParam(target) });

  const hrefForDay = (date: Date) =>
    buildHref({ month: formatMonthParam(month), day: formatDayParam(date) });

  const hrefWithoutDay = buildHref({ month: formatMonthParam(month) });

  const today: MonthRef = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  };

  const kindLabel = (kind: CalendarEvent["kind"]) =>
    legend.find((item) => item.kind === kind)?.label ?? KIND_FALLBACK_LABEL[kind];

  const selectedEvents = selectedDate ? eventsForDay(events, selectedDate) : [];

  return (
    <div>
      <div className="cal-header">
        <Link
          className="btn"
          href={hrefForMonth(shiftMonth(month, -1))}
          aria-label="Předchozí měsíc"
        >
          ‹
        </Link>

        <strong className="cal-title">{monthTitle(month)}</strong>

        <Link
          className="btn"
          href={hrefForMonth(shiftMonth(month, 1))}
          aria-label="Další měsíc"
        >
          ›
        </Link>

        <Link className="btn" href={hrefForMonth(today)}>
          Dnes
        </Link>

        {legend.length > 0 && (
          <div className="cal-legend">
            {legend.map((item) => (
              <span key={item.kind} className="cal-legend-item">
                <i className={KIND_SWATCH[item.kind]} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scroll obaluje jen mřížku - detail dne se pod ní zalomí normálně. */}
      <div className="cal-scroll">
        <div className="cal-grid" role="grid">
          {CZECH_WEEKDAYS_SHORT.map((name) => (
            <div key={name} className="cal-weekday" role="columnheader">
              {name}
            </div>
          ))}

          {weeks.flat().map((day) => {
            const dayEvents = eventsForDay(events, day.date);
            const shown = dayEvents.slice(0, MAX_EVENTS_PER_DAY);
            const hidden = dayEvents.length - shown.length;
            const isSelected =
              selectedDate !== null && isSameDay(selectedDate, day.date);

            const classes = [
              "cal-day",
              day.isCurrentMonth ? "" : "cal-day-outside",
              day.isToday ? "cal-day-today" : "",
              day.isWeekend ? "cal-day-weekend" : "",
              isSelected ? "cal-day-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const content = (
              <>
                <div className="cal-daynum">{day.dayOfMonth}</div>

                {shown.map((event) => (
                  <div
                    key={`${event.id}-${day.date.toISOString()}`}
                    className={KIND_CLASS[event.kind]}
                    title={event.detail ?? event.label}
                  >
                    <span className="cal-event-time">
                      {timeLabel(event, day.date)}
                    </span>{" "}
                    {event.label}
                  </div>
                ))}

                {hidden > 0 && (
                  <div className="cal-more">
                    +{hidden} {plural(hidden, "další", "další", "dalších")}
                  </div>
                )}
              </>
            );

            return (
              <div key={day.date.toISOString()} className={classes} role="gridcell">
                {/* Den bez událostí není odkaz - nebylo by co rozkliknout. */}
                {dayEvents.length === 0 ? (
                  content
                ) : (
                  <Link
                    className="cal-day-link"
                    href={hrefForDay(day.date)}
                    aria-label={`${day.dayOfMonth}. ${monthTitle(month)} - ${
                      dayEvents.length
                    } ${plural(dayEvents.length, "událost", "události", "událostí")}`}
                  >
                    {content}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <strong className="cal-detail-title">
              {selectedDate.toLocaleDateString("cs-CZ", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </strong>

            <span className="cal-detail-count">
              {selectedEvents.length}{" "}
              {plural(selectedEvents.length, "událost", "události", "událostí")}
            </span>

            <Link className="btn" href={hrefWithoutDay}>
              Zavřít
            </Link>
          </div>

          {selectedEvents.length === 0 ? (
            <p className="empty-state">V tenhle den tu nic není.</p>
          ) : (
            <ul className="cal-detail-list">
              {selectedEvents.map((event) => (
                <li key={event.id} className="cal-detail-item">
                  <i className={KIND_SWATCH[event.kind]} aria-hidden="true" />

                  <span className="cal-detail-time">
                    {dayRangeLabel(event, selectedDate)}
                  </span>

                  <span className="cal-detail-body">
                    <strong>{event.label}</strong>
                    <span className="cal-detail-kind">{kindLabel(event.kind)}</span>
                    {event.detail && (
                      <span className="cal-detail-note">{event.detail}</span>
                    )}
                  </span>

                  <span className="cal-detail-duration">
                    {formatDuration(event.start, event.end)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
