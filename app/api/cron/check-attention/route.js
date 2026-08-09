import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase.js';
import {
  ATTENTION_THRESHOLD_DAYS,
  daysSinceLastActivity,
  todayUtcMidnight,
} from '../../../../lib/dates.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/check-attention
//
// The scheduled half of the app. Vercel Cron runs this once a day (see the
// "crons" entry in vercel.json). It is a plain GET with no request body so you
// can also test it by pasting the URL into a browser.
//
// The rule, from Assignment 5A: an active application that has gone at least
// 10 days without an application update or employer contact gets flagged as
// needs_attention. The flag only marks the record for review - it does not mean
// the user should automatically contact the employer.
export async function GET() {
  const startedAt = new Date().toISOString();
  const today = todayUtcMidnight();

  const { data: applications, error } = await getSupabase()
    .from('applications')
    .select('id, company_name, job_title, date_applied, last_contact_date, needs_attention')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const flagged = [];
  const cleared = [];

  for (const application of applications) {
    const idleDays = daysSinceLastActivity(application, today);

    // A record with no usable dates cannot be judged on elapsed time, so leave
    // its flag alone rather than guessing.
    if (idleDays === null) continue;

    const shouldFlag = idleDays >= ATTENTION_THRESHOLD_DAYS;
    if (shouldFlag === application.needs_attention) continue;

    // Real database write, one row at a time so a single bad row cannot take
    // down the whole run.
    const { error: updateError } = await getSupabase()
      .from('applications')
      .update({
        needs_attention: shouldFlag,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to update application ${application.id}: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    const summary = {
      id: application.id,
      company_name: application.company_name,
      job_title: application.job_title,
      days_since_last_activity: idleDays,
    };
    (shouldFlag ? flagged : cleared).push(summary);
  }

  return NextResponse.json({
    ok: true,
    ran_at: startedAt,
    threshold_days: ATTENTION_THRESHOLD_DAYS,
    active_applications_reviewed: applications.length,
    newly_flagged_count: flagged.length,
    newly_cleared_count: cleared.length,
    newly_flagged: flagged,
    newly_cleared: cleared,
  });
}
