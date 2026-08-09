// Date helpers. All day counts are computed here so that both the dashboard,
// the scheduled attention check, and the Claude prompt use the same numbers.

// The 10-day rule from Assignment 5A.
export const ATTENTION_THRESHOLD_DAYS = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parse a date-ish value into a UTC midnight timestamp, or null.
function toUtcMidnight(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  );
}

export function todayUtcMidnight() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Whole days between a stored date and today. Positive means in the past.
// Returns null when the date is missing or unparseable.
export function daysSince(value, today = todayUtcMidnight()) {
  const then = toUtcMidnight(value);
  if (then === null) return null;
  return Math.round((today - then) / MS_PER_DAY);
}

// Whole days until a stored date. Positive means in the future.
export function daysUntil(value, today = todayUtcMidnight()) {
  const days = daysSince(value, today);
  return days === null ? null : -days;
}

// The guide treats "the more recent of date applied and last contact" as the
// best signal of how long it has actually been since something happened.
// Returns the smaller of the two day counts, or null if neither is available.
export function daysSinceLastActivity(application, today = todayUtcMidnight()) {
  const sinceApplied = daysSince(application.date_applied, today);
  const sinceContact = daysSince(application.last_contact_date, today);

  const candidates = [sinceApplied, sinceContact].filter((d) => d !== null);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

// Format a stored date for display without timezone drift.
export function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Normalize a date value to YYYY-MM-DD, which both `date` and `timestamp`
// columns in Postgres accept.
export function toDateOnly(value) {
  const utc = toUtcMidnight(value);
  if (utc === null) return null;
  return new Date(utc).toISOString().slice(0, 10);
}
