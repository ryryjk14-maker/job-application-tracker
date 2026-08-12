// Prompt, output schema, and context builder for the Job Search Insights
// feature. This mirrors the shape of lib/recommendation.js but is deliberately
// separate: that module reviews one application and picks one of five actions,
// this one interprets the portfolio as a whole. Neither imports the other, so
// changes here cannot affect "Recommend Next Action".
//
// The division of labour is the point of the feature: lib/analytics.js computes
// every factual number, and Claude is only ever shown the finished aggregate.

import { CONTACT_GAP_LABEL } from './analytics.js';

// Below this many tracked applications there is no portfolio to describe, so
// the app does not spend a Claude call on it.
export const MINIMUM_APPLICATIONS_FOR_INSIGHTS = 3;

export const SYSTEM_PROMPT = `You review a set of pre-computed statistics about one person's job application tracker and describe patterns you notice. You are an analyst looking at a summary table, not an agent acting on anyone's behalf.

Every figure you are given was calculated by the application from its own database before this conversation started. Treat those figures as the only facts available to you.

What you produce:
- Exactly 3 concise observations about patterns visible in the tracked applications. One or two sentences each.
- Exactly 1 recommended area of focus for the job search, with a short title and a brief rationale.
- A data_limitations note when the sample size, missing dates, or the meaning of a metric limits how far the numbers can be read. Use null when nothing meaningful limits interpretation.

Hard rules:
- Do not recalculate anything. Do not add, subtract, average, or convert the figures you are given.
- Do not state any number that is not present in the provided metrics. If a point cannot be made with the numbers as given, make a different point.
- Do not claim that one thing caused another. These are counts and rates from a single tracker; they can show that two things occur together, never that one produced the other. Phrase causal-sounding ideas as questions worth investigating.
- Do not speculate about why an employer made a decision. You have no information about any employer's reasoning, and none is available.
- Do not predict that any application will or will not succeed.
- Do not describe any individual company, role, or contact. You have not been given any, and you must not invent one.
- Every statement applies only to the applications currently tracked in this app. Do not generalise to the job market, to other candidates, or to what "usually" happens.
- You are advisory only. You never change a record, change a status, contact an employer, or take any action. The user decides what to do with what you write.

On specific metrics:
- The response rate counts applications where an employer response was *recorded* by the user. It measures the tracked data, not employer behaviour. Say so if you lean on it.
- "${CONTACT_GAP_LABEL}" is exactly what its name says. The underlying field holds the most recent contact, not the first, so this is not a measure of how quickly employers reply. Never describe it as response time or reply speed.
- Coverage figures tell you how many applications a date-based average actually describes. Low coverage means the average is thin, and that belongs in data_limitations.
- A small number of tracked applications means patterns may be coincidence. Say that plainly rather than writing confident findings on a handful of records.

Write plainly and specifically. Refer to the actual figures you were shown rather than making generic job-search statements that would be true of any tracker.`;

// Structured output schema. Array length is stated in the description and
// enforced by the route after parsing, rather than with minItems/maxItems, so
// the schema stays inside the supported subset.
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    observations: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Exactly 3 items. Each is one or two sentences describing a pattern visible in the provided metrics.',
    },
    focus_area: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short label for the recommended area of focus.',
        },
        rationale: {
          type: 'string',
          description:
            'One to three sentences explaining which of the provided figures point to this area.',
        },
      },
      required: ['title', 'rationale'],
      additionalProperties: false,
    },
    data_limitations: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'What limits interpretation: small sample size, missing dates, low coverage, or a metric that does not mean what it might appear to mean. Null when nothing meaningful limits interpretation.',
    },
  },
  required: ['observations', 'focus_area', 'data_limitations'],
  additionalProperties: false,
};

function formatCount(value) {
  return value === null || value === undefined ? 'not available' : String(value);
}

function formatPercent(value) {
  return value === null || value === undefined ? 'not available' : `${value}%`;
}

function formatDays(value) {
  return value === null || value === undefined
    ? 'not available'
    : `${value} day(s)`;
}

// Turn the computed metrics into the text block Claude sees. Only aggregates
// go in - no company names, contact names, email addresses, posting URLs, notes,
// or individual application rows of any kind.
export function buildInsightsContext(metrics) {
  const statusLines = Object.entries(metrics.by_status).map(
    ([status, count]) => `  - ${status}: ${count}`
  );
  if (metrics.status_unrecorded > 0) {
    statusLines.push(`  - (status not recognised): ${metrics.status_unrecorded}`);
  }

  const sinceApplying = metrics.days_since_applying;
  const contactGap = metrics.days_applied_to_most_recent_contact;

  return [
    'These figures were calculated by the application from its own database. They are the complete set of facts available to you.',
    '',
    'Portfolio size:',
    `  - Total tracked applications: ${formatCount(metrics.total_tracked)}`,
    `  - Active applications: ${formatCount(metrics.active_applications)}`,
    `  - Closed applications: ${formatCount(metrics.closed_applications)}`,
    '',
    'Applications by status:',
    ...statusLines,
    '',
    'Rates (denominator is total tracked applications):',
    `  - Applications with a recorded employer response: ${formatCount(
      metrics.recorded_responses.count
    )} (${formatPercent(metrics.recorded_responses.rate_percent)})`,
    `  - Applications that reached an interview stage: ${formatCount(
      metrics.interviews.count
    )} (${formatPercent(metrics.interviews.rate_percent)})`,
    '',
    'Attention:',
    `  - Active applications currently needing attention: ${formatCount(
      metrics.needs_attention_now
    )}`,
    `  - An application needs attention after ${metrics.attention_threshold_days} day(s) with no application update or recorded employer contact.`,
    '',
    'Timing across tracked applications with the required dates recorded:',
    `  - Average days since applying: ${formatDays(sinceApplying.average)}`,
    `  - Median days since applying: ${formatDays(sinceApplying.median)}`,
    `  - Based on ${formatCount(sinceApplying.counted)} of ${formatCount(
      metrics.total_tracked
    )} applications (${formatPercent(
      sinceApplying.coverage_percent
    )} coverage); ${formatCount(
      sinceApplying.missing_date_applied
    )} have no recorded application date.`,
    `  - ${CONTACT_GAP_LABEL}: ${formatDays(contactGap.average)}`,
    `  - Based on ${formatCount(contactGap.counted)} of ${formatCount(
      metrics.total_tracked
    )} applications (${formatPercent(
      contactGap.coverage_percent
    )} coverage); ${formatCount(
      contactGap.missing_either_date
    )} are missing an application date, a contact date, or both.`,
  ].join('\n');
}
