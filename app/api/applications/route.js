import { NextResponse } from 'next/server';
import { getSupabase, STATUS_OPTIONS } from '../../../lib/supabase.js';

export const dynamic = 'force-dynamic';

// Turn an empty form field into null so Postgres date columns stay happy.
function orNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// POST /api/applications - create a new application record.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const companyName = orNull(body.company_name);
  const jobTitle = orNull(body.job_title);

  if (!companyName || !jobTitle) {
    return NextResponse.json(
      { error: 'Company name and job title are required.' },
      { status: 400 }
    );
  }

  const status = orNull(body.status) || 'Applied';
  if (!STATUS_OPTIONS.includes(status)) {
    return NextResponse.json(
      { error: `Unknown status "${status}".` },
      { status: 400 }
    );
  }

  const record = {
    company_name: companyName,
    job_title: jobTitle,
    date_applied: orNull(body.date_applied),
    job_posting_url: orNull(body.job_posting_url),
    status,
    contact_name: orNull(body.contact_name),
    contact_email: orNull(body.contact_email),
    last_contact_date: orNull(body.last_contact_date),
    notes: orNull(body.notes),
    interview_date: orNull(body.interview_date),
    needs_attention: false,
    is_active: true,
  };

  const { data, error } = await getSupabase()
    .from('applications')
    .insert(record)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ application: data }, { status: 201 });
}
