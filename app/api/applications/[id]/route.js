import { NextResponse } from 'next/server';
import { getSupabase, STATUS_OPTIONS } from '../../../../lib/supabase.js';

export const dynamic = 'force-dynamic';

function orNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// PATCH /api/applications/:id
//
// Updates the fields the detail screen is allowed to change: status, last
// contact date, notes, and interview date. Also handles closing an application,
// which flips is_active to false but leaves the row in place so the history is
// retained.
export async function PATCH(request, { params }) {
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.close === true && body.reopen === true) {
    return NextResponse.json(
      { error: 'An application cannot be closed and reopened in the same request.' },
      { status: 400 }
    );
  }

  const updates = { updated_at: new Date().toISOString() };

  if ('status' in body) {
    const status = orNull(body.status);
    if (!status || !STATUS_OPTIONS.includes(status)) {
      return NextResponse.json(
        { error: `Unknown status "${body.status}".` },
        { status: 400 }
      );
    }
    updates.status = status;
  }

  if ('last_contact_date' in body) {
    updates.last_contact_date = orNull(body.last_contact_date);
  }

  if ('notes' in body) {
    updates.notes = orNull(body.notes);
  }

  if ('interview_date' in body) {
    updates.interview_date = orNull(body.interview_date);
  }

  // Closing an application keeps the record; it just leaves the active list.
  // A closed record should not keep showing up as needing attention.
  if (body.close === true) {
    updates.is_active = false;
    updates.needs_attention = false;
  }

  // Reopening only puts the record back on the active list. Status, dates,
  // notes, and the stored recommendation are left exactly as they were, so an
  // accidental close can be undone without losing anything. The daily
  // attention check re-evaluates needs_attention on its next run.
  if (body.reopen === true) {
    updates.is_active = true;
  }

  const { data, error } = await getSupabase()
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ application: data });
}
