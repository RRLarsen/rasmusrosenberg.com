// The rotating band on the home page: the quotes and promotions listed in data/site.yaml
// (band), in that order. A promotion is a media item or talk, normalised to one shape so every
// promotion uses the same template (src/components/Promo.astro). Titles, links and images always come from the record; the
// short description is a standard sentence for the record's type.
import { getCollection } from 'astro:content';
import { formatDate, getProfile, getPublications, isPublished, onWebsite } from './data';

export interface Promotion {
  title: string;
  /** e.g. "Dr. Larsen was a guest on CBC Ideas with Nahlah Ayed, 3 August 2026." */
  description: string;
  /** the outlet or event; used for the image's alt text and the fallback tile */
  source: string;
  date: string;
  image?: string;
  url?: string;
  action: string;
}

const actions: Record<string, string> = {
  radio: 'Listen to the episode',
  podcast: 'Listen to the episode',
  video: 'Watch',
  interview: 'Read the interview',
  press: 'Read the article',
  review: 'Read the review',
  other: 'Read more',
};

const today = new Date().toISOString().slice(0, 10);

/** The home page band: the slides in data/site.yaml (band), as quotes and promotions. */
export type Slide = { kind: 'quote'; text: string } | { kind: 'promo'; promo: Promotion };

export async function getBand(band: (({ quote: string } | { media: string } | { talk: string }) & { show?: boolean })[]): Promise<Slide[]> {
  const profile = await getProfile();
  const name = `Dr. ${profile.family_name.split(' ').at(-1)}`; // "Dr. Larsen"
  const pubs = await getPublications();
  const titleOf = (id?: string) => pubs.find((p) => p.id === id)?.data.title;
  const media = await getCollection('media', onWebsite);
  const talks = await getCollection('talks', isPublished);

  const sentence: Record<string, (source: string, extra?: string) => string> = {
    radio: (s) => `${name} was a guest on ${s}`,
    podcast: (s) => `${name} was a guest on ${s}`,
    video: (s) => `${name} appeared on ${s}`,
    interview: (s) => `${name} was interviewed by ${s}`,
    press: (s) => `${name}’s research was featured in ${s}`,
    review: (s, book) => (book ? `*${book}* was reviewed in ${s}` : `${name}’s work was reviewed in ${s}`),
    other: (s) => `${name} in ${s}`,
  };

  const slides: Slide[] = [];
  for (const item of band) {
    if (item.show === false) continue; // kept in the list, but out of the rotation
    if ('quote' in item) slides.push({ kind: 'quote', text: item.quote });
    else if ('media' in item) {
      const m = media.find((x) => x.id === item.media);
      if (m) slides.push({ kind: 'promo', promo: {
        title: m.data.title,
        description: `${(sentence[m.data.type] ?? sentence.other)(m.data.outlet, titleOf(m.data.publication))}, ${formatDate(m.data.date)}.`,
        source: m.data.outlet, date: m.data.date, image: m.data.image, url: m.data.url,
        action: actions[m.data.type] ?? 'Read more',
      } });
    } else {
      // talks are promoted only until the day they take place
      const t = talks.find((x) => x.id === item.talk);
      if (t && t.data.date >= today) slides.push({ kind: 'promo', promo: {
        title: t.data.title,
        description: `${name} will speak at ${t.data.event}${t.data.location ? `, ${t.data.location}` : ''}, ${formatDate(t.data.date)}.`,
        source: t.data.event, date: t.data.date, url: t.data.url, action: 'Event details',
      } });
    }
  }
  return slides;
}
