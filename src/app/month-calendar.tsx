import Link from "next/link";
import {
  CZECH_WEEKDAYS_SHORT,
  buildMonthGrid,
  eventsForDay,
  formatMonthParam,
  monthTitle,
  shiftMonth,
  type CalendarEvent,
  type MonthRef,
} from "@/lib/calendar";

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

function timeLabel(event: CalendarEvent, day: Date): string {
  // U úseku přes půlnoc by "00:00" mátlo, proto se u navazujícího dne
  // ukazuje šipka místo času.
  const startsToday =
    event.start.getFullYear() === day.getFullYear() &&
    event.start.getMonth() === day.getMonth() &&
    event.start.getDate() === day.getDate();

  if (!startsToday) return "→";

  return event.start.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface MonthCalendarProps {
  month: MonthRef;
  events: CalendarEvent[];
  /** Cesta, na kterou míří šipky měsíců (měsíc se předává v ?month=). */
  basePath: string;
  /** Ostatní parametry v URL, které mají listování přežít (např. filtr). */
  keepParams?: Record<string, string | undefined>;
  legend?: { kind: CalendarEvent["kind"]; label: string }[];
}

/**
 * Měsíční kalendář - server komponenta, listování jde přes odkazy s ?month=,
 * takže funguje i bez JavaScriptu a dá se poslat odkazem na konkrétní měsíc.
 */
export function MonthCalendar({
  month,
  events,
  basePath,
  keepParams = {},
  legend = [],
}: MonthCalendarProps) {
  const weeks = buildMonthGrid(month.year, month.month);

  const hrefFor = (target: MonthRef) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keepParams)) {
      if (value) params.set(key, value);
    }
    params.set("month", formatMonthParam(target));
    return `${basePath}?${params}`;
  };

  const today: MonthRef = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  };

  return (
    <div>
      <div className="cal-header">
        <Link className="btn" href={hrefFor(shiftMonth(month, -1))} aria-label="Předchozí měsíc">
          ‹
        </Link>

        <strong className="cal-title">{monthTitle(month)}</strong>

        <Link className="btn" href={hrefFor(shiftMonth(month, 1))} aria-label="Další měsíc">
          ›
        </Link>

        <Link className="btn" href={hrefFor(today)}>
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

          const classes = [
            "cal-day",
            day.isCurrentMonth ? "" : "cal-day-outside",
            day.isToday ? "cal-day-today" : "",
            day.isWeekend ? "cal-day-weekend" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={day.date.toISOString()} className={classes} role="gridcell">
              <div className="cal-daynum">{day.dayOfMonth}</div>

              {shown.map((event) => (
                <div
                  key={`${event.id}-${day.date.toISOString()}`}
                  className={KIND_CLASS[event.kind]}
                  title={event.detail ?? event.label}
                >
                  <span className="cal-event-time">{timeLabel(event, day.date)}</span>{" "}
                  {event.label}
                </div>
              ))}

              {hidden > 0 && <div className="cal-more">+{hidden} další</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
