import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../../../lib/supabase.js';
import { computePortfolioMetrics } from '../../../lib/analytics.js';
import {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  MINIMUM_APPLICATIONS_FOR_INSIGHTS,
  buildInsightsContext,
} from '../../../lib/insights.js';

export const dynamic = 'force-dynamic';

// Like /api/recommend, this route makes a real Claude API call, which can take
// longer than the default serverless function limit.
export const maxDuration = 60;

// POST /api/insights
//
// The on-demand half of the Insights screen, behind the "Generate AI Insights"
// button.
//
// The request body is ignored entirely. The route re-reads the applications
// from Supabase and recomputes every metric server-side, so a caller cannot
// hand Claude figures of their own choosing. What Claude receives is the
// resulting aggregate and nothing else: no company names, contact names, email
// addresses, posting URLs, notes, or individual application rows.
//
// Nothing is written back to the database. The insights are returned to the
// caller and live only in the browser for the length of the visit.
export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  // Only the columns the metrics need. The identifying and free-text fields are
  // never loaded here, so they cannot leak into the prompt by accident.
  const { data, error: loadError } = await getSupabase()
    .from('applications')
    .select('status, date_applied, last_contact_date, interview_date, is_active');

  if (loadError) {
    return NextResponse.json(
      { error: `Could not load applications: ${loadError.message}` },
      { status: 500 }
    );
  }

  const applications = data || [];
  const metrics = computePortfolioMetrics(applications);

  if (metrics.total_tracked < MINIMUM_APPLICATIONS_FOR_INSIGHTS) {
    return NextResponse.json(
      {
        error: `Portfolio insights need at least ${MINIMUM_APPLICATIONS_FOR_INSIGHTS} tracked applications. There ${
          metrics.total_tracked === 1 ? 'is' : 'are'
        } currently ${metrics.total_tracked}.`,
      },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content:
            'Review these statistics about the applications currently tracked and describe the patterns you notice.\n\n' +
            buildInsightsContext(metrics),
        },
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Claude API request failed: ${err.message}` },
      { status: 502 }
    );
  }

  if (message.stop_reason === 'refusal') {
    return NextResponse.json(
      { error: 'Claude declined to answer this request.' },
      { status: 502 }
    );
  }
  if (message.stop_reason === 'max_tokens') {
    return NextResponse.json(
      { error: 'Claude response was cut off before it finished.' },
      { status: 502 }
    );
  }

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock) {
    return NextResponse.json(
      { error: 'Claude returned no text content.' },
      { status: 502 }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return NextResponse.json(
      { error: 'Could not parse the insights returned by Claude.' },
      { status: 502 }
    );
  }

  // Validate the shape before it reaches the screen, the same way the
  // recommendation route validates its category.
  const observations = Array.isArray(parsed.observations)
    ? parsed.observations
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  if (observations.length !== 3) {
    return NextResponse.json(
      {
        error: `Claude returned ${observations.length} observation(s) instead of 3.`,
      },
      { status: 502 }
    );
  }

  const title =
    typeof parsed.focus_area?.title === 'string'
      ? parsed.focus_area.title.trim()
      : '';
  const rationale =
    typeof parsed.focus_area?.rationale === 'string'
      ? parsed.focus_area.rationale.trim()
      : '';

  if (!title || !rationale) {
    return NextResponse.json(
      { error: 'Claude did not return a complete recommended focus area.' },
      { status: 502 }
    );
  }

  const dataLimitations =
    typeof parsed.data_limitations === 'string' &&
    parsed.data_limitations.trim().length > 0
      ? parsed.data_limitations.trim()
      : null;

  return NextResponse.json({
    observations,
    focus_area: { title, rationale },
    data_limitations: dataLimitations,
    generated_at: new Date().toISOString(),
  });
}
