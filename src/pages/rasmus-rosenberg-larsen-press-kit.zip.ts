// The press kit download. Contents are assembled in src/lib/press-kit.ts.
import type { APIRoute } from 'astro';
import { buildPressKit } from '../lib/press-kit';

export const GET: APIRoute = async () =>
  new Response(await buildPressKit(), { headers: { 'Content-Type': 'application/zip' } });
