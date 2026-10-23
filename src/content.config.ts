// Collections for everything in data/. The rules themselves live in src/schemas.ts (shared
// with the CV app). If a data file breaks them, the build fails with a message naming the
// file and field. Schema changes need a migration of the existing data files in the same change.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { singleton } from './lib/singleton-loader';
import { makeSchemas } from './schemas';

const s = makeSchemas();
const list = (name: keyof typeof s) => defineCollection({ loader: file(`data/${name}.yaml`), schema: s[name] });

export const collections = {
  profile: defineCollection({ loader: singleton('data/profile.yaml'), schema: s.profile }),
  site: defineCollection({ loader: singleton('data/site.yaml'), schema: s.site }),
  scholar: defineCollection({ loader: singleton('data/scholar.yaml'), schema: s.scholar }),
  posts: defineCollection({ loader: glob({ pattern: '**/*.md', base: './posts' }), schema: s.posts }),
  tags: list('tags'),
  publications: list('publications'),
  positions: list('positions'),
  talks: list('talks'),
  media: list('media'),
  teaching: list('teaching'),
  grants: list('grants'),
  service: list('service'),
  awards: list('awards'),
  memberships: list('memberships'),
  manuscripts: list('manuscripts'),
  supervision: list('supervision'),
  expertise: list('expertise'),
  tools: list('tools'),
  journals: list('journals'),
};
