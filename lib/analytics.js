// Portfolio analytics for the Job Search Insights feature.
//
// Every number the Insights screen shows - and every number that is later sent
// to Claude - is produced here, in application code, from the rows stored in
// Supabase. Claude interprets these figures; it never calculates them.
//
// All day counts come from lib/dates.js so the dashboard, the daily attention
// check, and this module can never disagree about how old something is. There
// is deliberately no date arithmetic in this file.

import { STATUS_OPTIONS } from './statusOptions.js';
import {
  ATTENTION_THRESHOLD_DAYS,
  daysSince,
  daysSinceLastActivity,
  todayUtcMidnight,
} from './dates.js';

// A recorded employer response, for the purposes of the response rate. This
// measures what the user has written down, not what employers actually did.
//
// "Waiting" is a label the user sets on themselves rather than evidence of a
// reply, so it is not counted here - though an application marked Waiting still
// counts if a contact date was recorded. "Withdrawn" and "Closed" are
// user-initiated outcomes, so they are not treated as employer responses
// either. A rejection is a response.
const RESPONSE_STATUSES = [
  'Recruiter Contact',
  'Interview Scheduled',
  'Interview Completed',
  'Offer',
  'Rejected',
];

// Statuses that mean an interview happened or was arranged. An application that
// was interviewed and later rejected loses that signal from `status`, which is
// why the interview_date field is checked as well - it survives the status
// change.
const INTERVIEW_STATUSES = [
  'Interview Scheduled',
  'Interview Completed',
  'Offer',
];

// A percentage rounded to one decimal place, or null when there is nothing to
// divide by. Returning null rather than 0 keeps "no data" distinguishable from
// "genuinely zero" on screen.
function percentage(count, total) {
  if (!total) return null;
  return Math.round((count / total) * 1000) / 10;
}

function average(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value * 10) / 10;
}

function hasRecordedResponse(application, today) {
  if (daysSince(application.last_contact_date, today) !== null) return true;
  return RESPONSE_STATUSES.includes(application.status);
}

function reachedInterviewStage(application, today) {
  if (daysSince(application.interview_date, today) !== null) return true;
  return INTERVIEW_STATUSES.includes(application.status);
}

// Whole days between the application date and the most recent recorded employer
// contact, derived from two day counts taken against the same "today" so no new
// date maths is needed here. Positive means contact came after applying;
// negative is possible and meaningful, because a recruiter may have made contact
// before the user formally applied.
//
// Returns null unless both dates are present and parseable.
function daysFromApplyingToLastContact(application, today) {
  const sinceApplied = daysSince(application.date_applied, today);
  const sinceContact = daysSince(application.last_contact_date, today);
  if (sinceApplied === null || sinceContact === null) return null;
  return sinceApplied - sinceContact;
}

// The one metric that needs a caveat in its own name. `last_contact_date` holds
// the *most recent* employer contact, not the first one, and the user overwrites
// it every time they log a new touchpoint. So this is not "time to response" and
// must never be labelled as such - it is the gap between applying and whatever
// the latest recorded contact is.
export const CONTACT_GAP_LABEL =
  'Average days from applying to most recent recorded employer contact';

export function computePortfolioMetrics(
  applications,
  today = todayUtcMidnight()
) {
  const rows = Array.isArray(applications) ? applications : [];
  const totalTracked = rows.length;

  const byStatus = {};
  for (const status of STATUS_OPTIONS) byStatus[status] = 0;
  let statusUnrecorded = 0;

  let activeCount = 0;
  let responseCount = 0;
  let interviewCount = 0;
  let needsAttentionNow = 0;

  const daysSinceApplyingValues = [];
  const contactGapValues = [];

  for (const application of rows) {
    if (Object.prototype.hasOwnProperty.call(byStatus, application.status)) {
      byStatus[application.status] += 1;
    } else {
      statusUnrecorded += 1;
    }

    const isActive = application.is_active === true;
    if (isActive) activeCount += 1;

    if (hasRecordedResponse(application, today)) responseCount += 1;
    if (reachedInterviewStage(application, today)) interviewCount += 1;

    // Calculated live rather than read from the stored needs_attention flag,
    // which is only refreshed once a day by the scheduled job and can therefore
    // be up to 24 hours stale. Same rule as the cron: an active application
    // idle for at least the threshold, and records with no usable dates are
    // left out rather than guessed at.
    if (isActive) {
      const idleDays = daysSinceLastActivity(application, today);
      if (idleDays !== null && idleDays >= ATTENTION_THRESHOLD_DAYS) {
        needsAttentionNow += 1;
      }
    }

    const sinceApplied = daysSince(application.date_applied, today);
    if (sinceApplied !== null) daysSinceApplyingValues.push(sinceApplied);

    const contactGap = daysFromApplyingToLastContact(application, today);
    if (contactGap !== null) contactGapValues.push(contactGap);
  }

  return {
    total_tracked: totalTracked,
    active_applications: activeCount,
    closed_applications: totalTracked - activeCount,

    by_status: byStatus,
    status_unrecorded: statusUnrecorded,

    recorded_responses: {
      count: responseCount,
      rate_percent: percentage(responseCount, totalTracked),
    },

    interviews: {
      count: interviewCount,
      rate_percent: percentage(interviewCount, totalTracked),
    },

    needs_attention_now: needsAttentionNow,
    attention_threshold_days: ATTENTION_THRESHOLD_DAYS,

    // Measured across every tracked application - active and closed - that has
    // a usable date_applied. `counted` and `coverage_percent` say how much of
    // the portfolio the averages actually describe.
    days_since_applying: {
      average: average(daysSinceApplyingValues),
      median: median(daysSinceApplyingValues),
      counted: daysSinceApplyingValues.length,
      missing_date_applied: totalTracked - daysSinceApplyingValues.length,
      coverage_percent: percentage(daysSinceApplyingValues.length, totalTracked),
    },

    days_applied_to_most_recent_contact: {
      average: average(contactGapValues),
      counted: contactGapValues.length,
      missing_either_date: totalTracked - contactGapValues.length,
      coverage_percent: percentage(contactGapValues.length, totalTracked),
    },
  };
}
