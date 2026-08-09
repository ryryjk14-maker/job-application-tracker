import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../../../lib/supabase.js';
import { toDateOnly } from '../../../lib/dates.js';
import {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  RECOMMENDATION_CATEGORIES,
  buildApplicationContext,
} from '../../../lib/recommendation.js';

export const dynamic = 'force-dynamic';

// The on-demand agentic step calls the Claude API, which can take longer than
// the default serverless function limit. Raise the ceiling so a slower response
// is not cut off. 60 seconds is the maximum on Vercel's Hobby plan; paid plans
// allow more if you ever need it.
export const maxDuration = 60;

// POST /api/recommend  { "id": "<application id>" }
//
// The on-demand half of the app, behind the "Recommend Next Action" button.
// It loads one application, sends its context to Claude, validates the answer,
// and saves the recommendation back to Supabase. The recommendation is advisory
// only: nothing else about the record is changed.
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const id = body?.id;
  if (!id) {
    return NextResponse.json(
      { error: 'An application id is required.' },
      { status: 400 }
    );
  }

  const { data: application, error: loadError } = await getSupabase()
    .from('applications')
    .select('*')
    .eq('id', id)
    .single();

  if (loadError || !application) {
    return NextResponse.json(
      { error: loadError?.message || 'Application not found.' },
      { status: 404 }
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
            'Review this job application record and recommend one next action.\n\n' +
            buildApplicationContext(application),
        },
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Claude API request failed: ${err.message}` },
      { status: 502 }
    );
  }

  // Check why the model stopped before reading the content.
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
      { error: 'Could not parse the recommendation returned by Claude.' },
      { status: 502 }
    );
  }

  // Validate the category against the five allowed values before storing or
  // displaying it, as the decision guide requires.
  if (!RECOMMENDATION_CATEGORIES.includes(parsed.recommendation)) {
    return NextResponse.json(
      {
        error: `Claude returned an unrecognized recommendation: "${parsed.recommendation}".`,
      },
      { status: 502 }
    );
  }

  const reason =
    typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
  const uncertaintyNote =
    typeof parsed.uncertainty_note === 'string' &&
    parsed.uncertainty_note.trim().length > 0
      ? parsed.uncertainty_note.trim()
      : null;

  // Stored as readable text so the detail screen can show it directly.
  const storedRecommendation = [
    `${parsed.recommendation}: ${reason}`,
    uncertaintyNote ? `Uncertainty: ${uncertaintyNote}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const recommendationDate = toDateOnly(new Date());

  const { error: saveError } = await getSupabase()
    .from('applications')
    .update({
      claude_recommendation: storedRecommendation,
      recommendation_date: recommendationDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (saveError) {
    return NextResponse.json(
      { error: `Could not save the recommendation: ${saveError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    recommendation: parsed.recommendation,
    reason,
    uncertainty_note: uncertaintyNote,
    claude_recommendation: storedRecommendation,
    recommendation_date: recommendationDate,
  });
}
