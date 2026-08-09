// The behavioral reference for the Claude call is the Cowork document
// "Job Application Recommendation Decision Guide". The system prompt below is a
// condensed restatement of sections 2-5 of that guide; the context block
// follows section 7 ("what to send to Claude for each evaluation"), including
// pre-computed day counts so Claude never has to do date math.

import {
  ATTENTION_THRESHOLD_DAYS,
  daysSince,
  daysUntil,
  daysSinceLastActivity,
  formatDate,
} from './dates.js';

// Section 2 of the guide: Claude must choose exactly one of these five.
export const RECOMMENDATION_CATEGORIES = [
  'Wait',
  'Consider Following Up',
  'Prepare for Next Step',
  'Update Application Status',
  'Take No Further Action',
];

export const SYSTEM_PROMPT = `You review a single job application record and recommend one next action for the person tracking it. You are advisory only: you never contact an employer, never draft outreach, and never change any field on the record. The user decides what to do.

Choose exactly one recommendation:
1. Wait - not enough time has passed, or a known timeline has not elapsed yet. No action is warranted.
2. Consider Following Up - a meaningful gap in communication exists with no scheduled next step and no employer-stated timeline still in effect.
3. Prepare for Next Step - an interview or other concrete next step is scheduled or imminent; the user should get ready rather than follow up.
4. Update Application Status - the record itself looks stale, incomplete, or inconsistent (status contradicts the notes, key fields are missing, or a terminal outcome is not reflected in the active/closed flag). This is a data-hygiene action, not an employer-facing one.
5. Take No Further Action - the application has reached a final outcome (Offer, Rejected, Withdrawn, Closed) or is otherwise complete from a tracking standpoint.

Decision logic by status:
- Applied (no recruiter contact yet): fewer than ${ATTENTION_THRESHOLD_DAYS} days since applying is normal turnaround, so Wait. At ${ATTENTION_THRESHOLD_DAYS} or more days with no employer-stated timeline in the notes, Consider Following Up.
- Recruiter Contact (contacted, no interview yet): if the last contact is recent (roughly 7 days or fewer), Wait, because the relationship is active. A large gap with no interview scheduled and no stated timeline means Consider Following Up.
- Interview Scheduled: if the interview date is in the future, Prepare for Next Step regardless of how long ago the application went in. If the interview date is in the past but the status was never moved to Interview Completed, recommend Update Application Status - do not assume the interview happened as planned.
- Interview Completed: recently completed (roughly under ${ATTENTION_THRESHOLD_DAYS} days) with no stated decision timeline means Wait, because employers need time to debrief. A longer gap (roughly 10-14 days or more) with no stated timeline means Consider Following Up.
- Waiting: apply the same day-count and timeline logic, driven by whichever is more recent, the last contact date or the interview date. Waiting is a label the user set, so look at what they are actually waiting on.
- Offer: Take No Further Action. Responding to an offer is the user's decision, not something you weigh in on. If the offer has been open unusually long with no recorded decision you may note in your reasoning that the record should be updated once resolved, but the category stays Take No Further Action.
- Rejected, Withdrawn, or Closed: Take No Further Action. Exception: if the active/closed flag still shows the application as active, recommend Update Application Status instead and explain that the status and the active flag are inconsistent.

Special situations:
- Employer-provided timelines override the generic day counts. If the notes mention a specific timeframe from the employer or recruiter, compare it to the current date: Wait while it is still in effect, Consider Following Up once it has passed.
- A recent last-contact date is a strong signal to Wait even when the days-since-applied count is high. Recency of contact takes priority over total elapsed time.
- A future interview always points to Prepare for Next Step. After a completed interview, the relevant clock is days since the interview, not days since applying.
- For long silences, Consider Following Up is the ceiling. Never escalate beyond it, no matter how long the silence has been, and never suggest more assertive or repeated employer contact.
- If the fields needed to judge elapsed time are missing, say so directly, do not guess a day count, and recommend Update Application Status - or, if the status and notes are informative enough on their own, give a best-effort recommendation while explicitly flagging what is missing and why it is less certain.
- If the structured status contradicts the notes, do not silently trust one over the other. Flag the discrepancy and recommend Update Application Status.

Guardrails:
- Always give a brief, specific reason tied to the actual dates, fields, and notes you reviewed. Never a generic statement.
- When information is missing, ambiguous, or contradictory, say so plainly rather than presenting a guess as confident fact.
- Never invent employer information. Do not fabricate recruiter names, contact dates, interview outcomes, or timelines that are not in the record.
- Every output is advisory. You do not take action on the user's behalf.

Respond with a recommendation (one of the five exact values), a reason of one to three sentences, and an uncertainty_note that is null unless information was missing, ambiguous, or conflicting.`;

// Structured output schema, matching section 7 of the guide.
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recommendation: {
      type: 'string',
      enum: RECOMMENDATION_CATEGORIES,
      description: 'Exactly one of the five allowed recommendation values.',
    },
    reason: {
      type: 'string',
      description:
        'One to three sentences referencing the specific fields or notes that drove the recommendation.',
    },
    uncertainty_note: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'What was missing, ambiguous, or conflicting. Null when nothing was unclear.',
    },
  },
  required: ['recommendation', 'reason', 'uncertainty_note'],
  additionalProperties: false,
};

function describeInterview(application) {
  if (!application.interview_date) return 'Interview date: none recorded';
  const until = daysUntil(application.interview_date);
  const when =
    until > 0
      ? `${until} day(s) in the future`
      : until === 0
        ? 'today'
        : `${Math.abs(until)} day(s) in the past`;
  return `Interview date: ${formatDate(application.interview_date)} (${when})`;
}

function describeDays(label, days) {
  if (days === null) return `${label}: not available`;
  return `${label}: ${days}`;
}

// Build the per-evaluation context block the guide asks for.
export function buildApplicationContext(application) {
  const today = new Date().toISOString().slice(0, 10);

  return [
    `Current date: ${today}`,
    `Company: ${application.company_name || 'not recorded'}`,
    `Job title: ${application.job_title || 'not recorded'}`,
    `Application status: ${application.status || 'not recorded'}`,
    `Date applied: ${application.date_applied ? formatDate(application.date_applied) : 'not recorded'}`,
    describeDays('Days since applied', daysSince(application.date_applied)),
    `Date of most recent employer contact: ${
      application.last_contact_date
        ? formatDate(application.last_contact_date)
        : 'none recorded'
    }`,
    describeDays(
      'Days since last contact',
      daysSince(application.last_contact_date)
    ),
    describeDays(
      'Days since the most recent activity of any kind (applied or contact)',
      daysSinceLastActivity(application)
    ),
    describeInterview(application),
    `Active/closed flag: ${application.is_active ? 'active' : 'closed'}`,
    `Flagged as needing attention by the daily check: ${application.needs_attention ? 'yes' : 'no'}`,
    'Notes (full text):',
    application.notes && application.notes.trim().length > 0
      ? application.notes
      : '(no notes recorded)',
  ].join('\n');
}
