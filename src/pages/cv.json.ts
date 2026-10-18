// The CV model as JSON, at /cv.json. The PDF builder (scripts/cv/build-pdf.mjs) feeds it to
// Typst. It contains only public data: student names are added for the private PDF only.
import type { APIRoute } from 'astro';
import { buildCv } from '../lib/cv';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildCv()), { headers: { 'Content-Type': 'application/json' } });
