// The rules for everything in data/. Used by the site build (src/content.config.ts) and by
// the CV app (scripts/cv-app), so both check entries in exactly the same way.
// Schema changes need a migration of the existing data files in the same change.
import { z } from 'astro/zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

// YAML turns unquoted 2024 into a number and 2024-05-01 into a Date; accept both and
// store every date as an ISO string: YYYY, YYYY-MM or YYYY-MM-DD.
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v) : v),
  z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, 'Use YYYY, YYYY-MM or YYYY-MM-DD, with a real month and day'),
);
// Numbers like volumes and page counts are often unquoted in YAML.
const text = z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string());

const status = z.enum(['published', 'draft', 'suggested']);
const link = z.object({ label: z.string(), url: z.url() });
// false = the entry appears in the CV but not on the website
const onWebsite = z.boolean().default(true);

const author = z.object({
  family: z.string(),
  given: z.string(),
  me: z.boolean().optional(),
});

const profileLinks = z.object({
  google_scholar: z.url().optional(),
  researchgate: z.url().optional(),
  linkedin: z.url().optional(),
  youtube: z.url().optional(),
  orcid: z.url().optional(),
  philpapers: z.url().optional(),
  github: z.url().optional(),
  bluesky: z.url().optional(),
});

/**
 * Builds the schemas. Tags and publication ids are read from data/ each time, so that an
 * unknown tag or a reference to a missing publication is caught (the CV app calls this
 * again after every save; the site build calls it once).
 */
export function makeSchemas(dataDir = join(process.cwd(), 'data')) {
  const idsIn = (fileName: string) =>
    ((parse(readFileSync(join(dataDir, fileName), 'utf8')) ?? []) as { id: string }[]).map((e) => e.id);
  const oneOf = (ids: string[], what: string) =>
    z.string().refine((v) => ids.includes(v), { error: (i) => `Unknown ${what} "${i.input}"` });
  // Tags must come from the controlled list in data/tags.yaml.
  const tags = z.array(oneOf(idsIn('tags.yaml'), 'tag (add it to data/tags.yaml first)')).default([]);
  const publicationId = oneOf(idsIn('publications.yaml'), 'publication id');

  return {
    profile: z.object({
      name: z.string(),
      given_name: z.string(),
      family_name: z.string(),
      honorific_suffix: z.string().optional(),
      titles: z.array(z.object({ role: z.string(), unit: z.string().optional(), organization: z.string(), url: z.url().optional() })).min(1),
      fields: z.array(z.string()),
      email: z.email(),
      address: z.array(z.string()),
      links: profileLinks,
      show_links: z.array(profileLinks.keyof()),
      cv_pdf: z.string().optional(),
      photo: z.object({ portrait: z.string(), wide: z.string(), alt: z.string() }),
      press_kit: z.object({ photo_credit: z.string(), cover_credit: z.string().optional(), usage: z.string() }),
      education: z.array(z.object({ degree: z.string(), field: z.string(), institution: z.string(), date: isoDate.optional(), supervisor: z.string().optional() })),
      research_interests: z.object({ specialization: z.array(z.string()), competence: z.array(z.string()).default([]) }).optional(),
      bio: z.object({ short: z.string(), medium: z.string(), long: z.string() }),
    }),

    site: z.object({
      title: z.string(),
      description: z.string(),
      url: z.url(),
      quotes: z.array(z.string()).min(1),
      intro: z.string(),
      pages: z.record(z.string(), z.string()),
    }),

    scholar: z.object({
      profile_url: z.url(),
      as_of: isoDate,
      citations: z.number().int(),
      h_index: z.number().int(),
      i10_index: z.number().int().optional(),
      citations_per_year: z.record(z.string().regex(/^\d{4}$/), z.number().int()),
    }),

    // Blog posts: one Markdown file each in posts/.
    posts: z.object({
      status,
      title: z.string(),
      date: isoDate,
      summary: z.string().optional(),
      tags,
    }),

    tags: z.object({ label: z.string(), description: z.string().optional() }),

    // The CV builder's suggestions inbox (data/inbox.yaml); not a site collection.
    inbox: z.object({
      youtube_channel_id: z.string().regex(/^UC[\w-]{22}$/).optional(),
      searches: z.array(z.string()).optional(), // Google News and Apple Podcasts searches
      dismissed: z.array(z.string()).default([]),
    }),

    publications: z
      .object({
        status,
        on_website: onWebsite,
        type: z.enum(['book', 'article', 'chapter', 'review', 'commentary', 'op-ed', 'other']),
        title: z.string(),
        subtitle: z.string().optional(),
        authors: z.array(author).min(1),
        editors: z.array(z.string()).optional(),
        date: isoDate.optional(),
        // set for work not yet published; such entries need no date
        stage: z.enum(['under contract', 'in press', 'forthcoming']).optional(),
        venue: z.string().optional(),
        volume: text.optional(),
        issue: text.optional(),
        pages: text.optional(),
        publisher: z.string().optional(),
        place: z.string().optional(),
        note: z.string().optional(),
        doi: z.string().regex(/^10\.\S+$/, 'A DOI starts with 10. and has no spaces or URL prefix').optional(),
        isbn: text.optional(),
        openalex_id: z.string().optional(),
        philpapers_id: z.string().optional(),
        publisher_url: z.url().optional(),
        website: z.url().optional(), // a book's own website, e.g. https://www.psychopathyunmasked.com
        oa_url: z.url().optional(),
        // the work's ResearchGate page: the PDF button links here when there is no direct pdf
        researchgate: z.url().optional(),
        // a PDF of the work: a URL, or a path to a file in public/ (e.g. /papers/larsen-2020.pdf)
        pdf: z.string().optional(),
        abstract: z.string().optional(),
        description: z.string().optional(),
        // a book's full description for the Book page: paragraphs separated by a blank line, the first shown in bold
        long_description: z.string().optional(),
        // endorsements of a book, shown under "Praise" on the Book page
        praise: z.array(z.object({ quote: z.string(), name: z.string(), affiliation: z.string().optional() })).optional(),
        cover: z.string().optional(),
        // thumbnail for op-eds and other writing on the Blog & Media page
        image: z.string().optional(),
        links: z.array(link).optional(),
        tags,
        featured: z.boolean().default(false),
      })
      .refine((p) => p.date || p.stage, { message: 'Give a date, or a stage such as "under contract"', path: ['date'] }),

    positions: z.object({
      status,
      kind: z.enum(['academic', 'affiliation', 'visiting', 'other']),
      title: z.string(),
      organization: z.string(),
      department: z.string().optional(),
      description: z.string().optional(),
      start: isoDate.optional(),
      end: isoDate.optional(), // no end date means current
    }),

    // Conference presentations and invited lectures (CV sections C.5 and C.6)
    talks: z.object({
      status,
      category: z.enum(['conference', 'invited']),
      format: z.enum(['presentation', 'keynote', 'poster', 'panel', 'lecture', 'talk']),
      title: z.string(),
      event: z.string(),
      location: z.string().optional(),
      date: isoDate,
      host: z.string().optional(), // e.g. "Dr. Ben Spivak" for invited lectures
      audience: z.string().optional(), // e.g. "Graduate seminar"
      note: z.string().optional(), // e.g. "Postponed", "Co-presented with Sonya McLaren"
      url: z.url().optional(),
      video_url: z.url().optional(),
      tags,
      featured: z.boolean().default(false),
    }),

    media: z.object({
      status,
      on_website: onWebsite,
      type: z.enum(['interview', 'podcast', 'press', 'video', 'review', 'radio', 'other']),
      title: z.string(),
      outlet: z.string(),
      date: isoDate,
      url: z.url().optional(),
      summary: z.string().optional(),
      image: z.string().optional(), // thumbnail, a path in public/
      // set when the item is about one of Rasmus's publications, e.g. a book review
      publication: publicationId.optional(),
      tags,
      featured: z.boolean().default(false),
    }),

    teaching: z.object({
      status,
      on_website: onWebsite,
      code: z.string().optional(),
      title: z.string(),
      institution: z.string().optional(),
      level: z.enum(['undergraduate', 'graduate', 'continuing-education', 'teaching-assistant', 'other']),
      role: z.string().optional(), // for teaching-assistant entries, e.g. "Co-instructor"
      instructor: z.string().optional(), // for teaching-assistant entries
      date: isoDate.optional(), // for continuing-education courses and seminars
      url: z.url().optional(),
      terms: z.array(z.string()).default([]),
      description: z.string().optional(),
      syllabus_url: z.url().optional(),
    }),

    // Research grants and other grants and scholarships (CV sections B.4 and B.5)
    grants: z.object({
      status,
      kind: z.enum(['research', 'scholarship']),
      date: isoDate,
      title: z.string(),
      amount: z.number().optional(),
      url: z.url().optional(),
    }),

    // Editorial, reviewer and administrative service (CV sections C.7 and E)
    service: z.object({
      status,
      kind: z.enum(['editorial', 'reviewer', 'administrative']),
      role: z.string(),
      organization: z.string().optional(),
      start: isoDate,
      end: isoDate.optional(), // no end date means ongoing; same as start for a single year
      url: z.url().optional(),
    }),

    // Awards and honours (CV section B.3)
    awards: z.object({ status, date: isoDate, title: z.string() }),

    // Professional association memberships (CV section B.6)
    memberships: z.object({ status, organization: z.string(), start: isoDate, end: isoDate.optional() }),

    // Manuscripts under review and in preparation (CV section C.4)
    manuscripts: z.object({
      status,
      kind: z.enum(['book', 'article']),
      stage: z.enum(['in review', 'in preparation']),
      title: z.string(),
      coauthors: z.array(z.string()).default([]),
    }),

    // Student supervision (CV section D.2). Student names are kept out of this public data, in
    // private/supervision-names.yaml (never uploaded), and appear only in the private PDF CV.
    supervision: z.object({
      status,
      level: z.enum(['graduate', 'undergraduate']),
      role: z.string(),
      project: z.string().optional(),
      course: z.string().optional(),
      unit: z.string().optional(),
      date: isoDate.optional(), // year; no date means current
    }),

    expertise: z.object({
      status,
      order: z.number(),
      title: z.string(),
      summary: z.string(),
      details: z.string().optional(),
    }),

    tools: z.object({
      status,
      title: z.string(),
      description: z.string(),
      url: z.url(),
      updated: isoDate.optional(),
    }),
  };
}

export type Schemas = ReturnType<typeof makeSchemas>;
