// schema.org structured data, so search engines understand who Rasmus is and what he wrote.
import { fullTitle, linkFor, type Publication } from './data';

type Profile = Awaited<ReturnType<typeof import('./data').getProfile>>;

export function person(profile: Profile, siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${siteUrl}/#person`,
    name: profile.name,
    givenName: profile.given_name,
    familyName: profile.family_name,
    honorificSuffix: profile.honorific_suffix,
    jobTitle: profile.titles[0].role,
    worksFor: profile.titles.map((t) => ({
      '@type': 'Organization',
      name: t.unit ? `${t.unit}, ${t.organization}` : t.organization,
      url: t.url,
    })),
    alumniOf: profile.education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.institution })),
    knowsAbout: profile.fields,
    email: `mailto:${profile.email}`,
    image: new URL(profile.photo.portrait, siteUrl).href,
    url: siteUrl,
    sameAs: Object.values(profile.links),
  };
}

export function publication(p: Publication, siteUrl: string) {
  const isBook = p.data.type === 'book';
  return {
    '@context': 'https://schema.org',
    '@type': isBook ? 'Book' : p.data.type === 'chapter' ? 'Chapter' : 'ScholarlyArticle',
    name: fullTitle(p),
    author: p.data.authors.map((a) =>
      a.me ? { '@id': `${siteUrl}/#person` } : { '@type': 'Person', name: `${a.given} ${a.family}` },
    ),
    datePublished: p.data.date,
    publisher: p.data.publisher ? { '@type': 'Organization', name: p.data.publisher } : undefined,
    isPartOf: !isBook && p.data.venue ? { '@type': p.data.type === 'chapter' ? 'Book' : 'Periodical', name: p.data.venue } : undefined,
    isbn: p.data.isbn,
    numberOfPages: isBook && p.data.pages ? Number(p.data.pages) : undefined,
    image: p.data.cover ? new URL(p.data.cover, siteUrl).href : undefined,
    description: p.data.description ?? p.data.abstract,
    sameAs: p.data.doi ? `https://doi.org/${p.data.doi}` : undefined,
    url: linkFor(p),
  };
}
