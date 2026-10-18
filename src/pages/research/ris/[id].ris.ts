// One .ris citation file per publication, at /research/ris/<id>.ris
import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublications, type Publication } from '../../../lib/data';
import { ris } from '../../../lib/ris';

export const getStaticPaths: GetStaticPaths = async () =>
  (await getPublications()).map((p) => ({ params: { id: p.id }, props: { p } }));

export const GET: APIRoute = ({ props }) =>
  new Response(ris((props as { p: Publication }).p), {
    headers: { 'Content-Type': 'application/x-research-info-systems; charset=utf-8' },
  });
