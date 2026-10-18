// Promotions for the rotating band on the home page. Any record marked `featured: true`
// becomes a promotion, normalised to one shape so every promotion uses the same template
// (src/components/Promo.astro). Titles, links and images always come from the record; the
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

export async function getPromotions(): Promise<Promotion[]> {
  const profile = await getProfile();
  const name = `Dr. ${profile.family_name.split(' ').at(-1)}`; // "Dr. Larsen"
  const pubs = await getPublications();
  const titleOf = (id?: string) => pubs.find((p) => p.id === id)?.data.title;

  const sentence: Record<string, (source: string, extra?: string) => string> = {
    radio: (s) => `${name} was a guest on ${s}`,
    podcast: (s) => `${name} was a guest on ${s}`,
    video: (s) => `${name} appeared on ${s}`,
    interview: (s) => `${name} was interviewed by ${s}`,
    press: (s) => `${name}’s research was featured in ${s}`,
    review: (s, book) => (book ? `${book} was reviewed in ${s}` : `${name}’s work was reviewed in ${s}`),
    other: (s) => `${name} in ${s}`,
  };

  const media = await getCollection('media', (m) => onWebsite(m) && m.data.featured);
  // talks are promoted only until the day they take place
  const talks = await getCollection('talks', (t) => isPublished(t) && t.data.featured && t.data.date >= today);

  return [
    ...media.map((m) => ({
      title: m.data.title,
      description: `${(sentence[m.data.type] ?? sentence.other)(m.data.outlet, titleOf(m.data.publication))}, ${formatDate(m.data.date)}.`,
      source: m.data.outlet, date: m.data.date, image: m.data.image, url: m.data.url,
      action: actions[m.data.type] ?? 'Read more',
    })),
    ...talks.map((t) => ({
      title: t.data.title,
      description: `${name} will speak at ${t.data.event}${t.data.location ? `, ${t.data.location}` : ''}, ${formatDate(t.data.date)}.`,
      source: t.data.event, date: t.data.date, url: t.data.url, action: 'Event details',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
