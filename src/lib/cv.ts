// The CV as one model: sections, headings and formatted entries, built from data/.
// The About page (src/components/CvDocument.astro) and the PDF CV (cv/cv.typ, fed by
// /cv.json) both render this model, so they always show the same content in the same order.
import { getCollection, type CollectionEntry } from 'astro:content';
import { getProfile, getPublications, getSite, isPublished, byDateDesc, fullTitle } from './data';
import { apaRuns, type Run } from './cite';

export interface CvEntry {
  /** the left column: a date, a range, or (for facts) a label */
  when?: string;
  /** for numbered lists: the entry's number (the newest has the highest) */
  num?: number;
  runs: Run[];
}
export interface CvBlock {
  level: 1 | 2 | 3;
  title: string;
  /** dated: date column + text; refs: hanging-indent references; list: hanging-indent lines; facts: label + value; text: paragraphs */
  kind?: 'dated' | 'refs' | 'list' | 'facts' | 'text';
  /** number the entries, counting down, so the first number is the total */
  numbered?: boolean;
  entries?: CvEntry[];
}
export interface Cv {
  name: string;
  /** the short form used in the PDF title, e.g. "Rasmus R. Larsen, Ph.D." */
  title_name: string;
  headline: string[];
  contact: Run[];
  updated: string;
  blocks: CvBlock[];
}

const t = (s: string, extra: Partial<Run> = {}): Run => ({ t: s, ...extra });

/** "2025-07" → "July 2025"; "2025" stays "2025" */
export const monthYear = (iso?: string) => {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  return m ? `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y}` : String(y);
};
const range = (start?: string, end?: string, single = false) => {
  if (!start) return '';
  const s = start.slice(0, 4), e = end?.slice(0, 4);
  if (single && e === s) return s;
  return `${s}–${e ?? 'present'}`;
};
const money = (n?: number) => (n ? ` ($${n.toLocaleString('en-US')})` : '');
/** “Title.” but “Title?”: no extra full stop after a question or exclamation mark */
const quoted = (s: string) => `“${s}”${/[?!]$/.test(s) ? '' : '.'}`;
/** Text with *asterisks* around the parts to set in italics (used in award titles). */
const emphRuns = (s: string): Run[] => s.split(/\*([^*]+)\*/).map((x, i) => t(x, i % 2 ? { i: true } : {})).filter((r) => r.t);
/** "Rasmus" + "Rosenberg Larsen" → "Rasmus R. Larsen": earlier family names become initials */
const shortName = (given: string, family: string) => {
  const parts = family.split(' ');
  return [given, ...parts.slice(0, -1).map((x) => `${x[0]}.`), parts.at(-1)].join(' ');
};
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');

const otherLabel: Record<string, string> = { 'op-ed': 'Op-ed', other: 'Commentary', review: 'Book review' };
const mediaLabel: Record<string, string> = {
  radio: 'Radio interview', podcast: 'Podcast interview', interview: 'Interview', press: 'In focus',
  review: 'Book review', video: 'Video', other: 'Editorial',
};
const talkLabel: Record<string, string> = {
  presentation: 'Presentation', keynote: 'Keynote', poster: 'Poster presentation', panel: 'Panel', lecture: 'Invited lecture', talk: 'Invited speaker',
};

const termKey = (term: string) => {
  const [season, year] = term.includes(' ') ? term.split(' ') : ['', term];
  return Number(year) * 10 + ({ Spring: 1, Summer: 2, Fall: 3 }[season] ?? 0);
};

export async function buildCv(): Promise<Cv> {
  const profile = await getProfile();
  const webHost = `www.${new URL((await getSite()).url).host.replace(/^www\./, '')}`;
  const all = <C extends Parameters<typeof getCollection>[0]>(c: C) => getCollection(c, isPublished);

  const pubs = await getPublications();
  // current appointments first (e.g. UTM, then NCOR), then past ones; each group newest first
  const positions = (await all('positions')).sort((a, b) =>
    Number(!!a.data.end) - Number(!!b.data.end) || (b.data.start ?? '').localeCompare(a.data.start ?? ''));
  const awards = (await all('awards')).sort(byDateDesc);
  const grants = (await all('grants')).sort(byDateDesc);
  const memberships = (await all('memberships')).sort((a, b) => b.data.start.localeCompare(a.data.start));
  const manuscripts = await all('manuscripts');
  const talks = (await all('talks')).sort(byDateDesc);
  const service = (await all('service')).sort((a, b) => b.data.start.localeCompare(a.data.start));
  const media = (await all('media')).sort(byDateDesc);
  const teaching = await all('teaching');
  const supervision = await all('supervision');

  const latest = (c: CollectionEntry<'teaching'>) => Math.max(0, ...c.data.terms.map(termKey));
  const byRecent = (a: CollectionEntry<'teaching'>, b: CollectionEntry<'teaching'>) => latest(b) - latest(a);
  const course = (c: CollectionEntry<'teaching'>): CvEntry => ({
    runs: [t(`${c.data.title} (${c.data.code}), ${c.data.institution}. `), t(c.data.terms.join(', '), { i: true })],
  });
  const orcid = profile.links.orcid?.replace('https://orcid.org/', '');

  const blocks: CvBlock[] = [];
  const add = (b: CvBlock) => {
    if (b.numbered && b.entries) b.entries.forEach((e, i) => (e.num = b.entries!.length - i));
    if (b.kind === undefined || (b.entries && b.entries.length > 0)) blocks.push(b);
  };

  // A. Personal information
  add({ level: 1, title: 'A. Personal information' });
  add({ level: 2, title: '', kind: 'facts', entries: [
    { when: 'Name', runs: [t(profile.name)] },
    { when: 'Affiliation', runs: [t(profile.titles[0].organization)] },
    { when: 'Address', runs: [t(profile.address.join(', '))] },
    { when: 'Email', runs: [t(profile.email, { href: `mailto:${profile.email}` })] },
    ...(orcid ? [{ when: 'ORCID', runs: [t(orcid, { href: profile.links.orcid })] }] : []),
    { when: 'Website', runs: [t(webHost, { href: `https://${webHost}` })] },
  ] });

  // B. Academic history
  add({ level: 1, title: 'B. Academic history' });
  add({ level: 2, title: 'B.1 Education', kind: 'dated', entries: profile.education.map((e) => ({
    when: monthYear(e.date), runs: [t(`${e.degree} ${e.field}, ${e.institution}.${e.supervisor ? ` Supervisor: ${e.supervisor}.` : ''}`)],
  })) });
  add({ level: 2, title: 'B.2 Academic employment and research appointments', kind: 'dated', entries: positions.map((p) => ({
    when: range(p.data.start, p.data.end),
    runs: [t(`${p.data.title}, ${p.data.organization}${p.data.department ? `, ${p.data.department}` : ''}${p.data.description ? ` (${p.data.description})` : ''}.`)],
  })) });
  add({ level: 2, title: 'B.3 Awards and honours', kind: 'dated', entries: awards.map((a) => ({ when: monthYear(a.data.date), runs: [...emphRuns(a.data.title), t('.')] })) });
  add({ level: 2, title: 'B.4 Research grants', kind: 'dated', entries: grants.filter((g) => g.data.kind === 'research').map((g) => ({
    when: monthYear(g.data.date), runs: [t(`${g.data.title}${money(g.data.amount)}.`)],
  })) });
  add({ level: 2, title: 'B.5 Other grants and scholarships', kind: 'dated', entries: grants.filter((g) => g.data.kind === 'scholarship').map((g) => ({
    when: monthYear(g.data.date), runs: [t(`${g.data.title}${money(g.data.amount)}.`)],
  })) });
  add({ level: 2, title: 'B.6 Professional association memberships', kind: 'dated', entries: memberships.map((m) => ({
    when: range(m.data.start, m.data.end), runs: [t(`Member, ${m.data.organization}.`)],
  })) });

  // C. Scholarly and professional work
  add({ level: 1, title: 'C. Scholarly and professional work' });
  if (profile.research_interests) {
    const ri = profile.research_interests;
    const rows = (label: string, items: string[]) => items.map((x, i) => ({ when: i === 0 ? label : '', runs: [t(x)] }));
    add({ level: 2, title: 'C.1 Research interests', kind: 'dated', entries: [
      ...rows('Specialization', ri.specialization),
      ...rows('Competence', ri.competence),
    ] });
  }
  add({ level: 2, title: 'C.2 Refereed publications' });
  add({ level: 3, title: 'Books', kind: 'refs', numbered: true, entries: pubs.filter((p) => p.data.type === 'book' && !p.data.stage).map((p) => ({ runs: apaRuns(p) })) });
  add({ level: 3, title: 'Peer-reviewed articles and chapters', kind: 'refs', numbered: true, entries: pubs.filter((p) => ['article', 'chapter', 'commentary'].includes(p.data.type)).map((p) => ({ runs: apaRuns(p) })) });
  add({ level: 2, title: 'C.3 Other publications (non-peer-reviewed)', kind: 'refs', entries: pubs.filter((p) => ['op-ed', 'other', 'review'].includes(p.data.type)).map((p) => ({
    runs: [t(`${otherLabel[p.data.type]}:`, { b: true }), t(" "), ...apaRuns(p)],
  })) });
  // books first (under contract, then in preparation), then articles and chapters (in review, then in preparation)
  const msRuns = (m: (typeof manuscripts)[number]) => ({
    runs: [t(`${m.data.kind === 'book' ? 'Book manuscript' : 'Manuscript'} ${m.data.stage}: `), t(m.data.title, { i: true }), t(`.${m.data.coauthors.length ? ` Co-authored with ${andList(m.data.coauthors)}.` : ''}`)],
  });
  const byStage = (order: string[]) => (a: { data: { stage: string } }, b: { data: { stage: string } }) => order.indexOf(a.data.stage) - order.indexOf(b.data.stage);
  add({ level: 2, title: 'C.4 Publications under review and manuscripts in preparation' });
  add({ level: 3, title: 'Books', kind: 'list', entries: [
    ...pubs.filter((p) => p.data.type === 'book' && p.data.stage).map((p) => ({
      runs: [t(`Book manuscript ${p.data.stage}: `), t(fullTitle(p), { i: true }), t(`${p.data.publisher ? ` (${p.data.publisher})` : ''}.`)],
    })),
    ...manuscripts.filter((m) => m.data.kind === 'book').sort(byStage(['in review', 'in preparation'])).map(msRuns),
  ] });
  add({ level: 3, title: 'Articles and chapters', kind: 'list', entries:
    manuscripts.filter((m) => m.data.kind !== 'book').sort(byStage(['in review', 'in preparation'])).map(msRuns) });
  // the event in italics, then the place
  const venue = (d: { event: string; location?: string }) => [t(d.event, { i: true }), t(`${d.location ? `, ${d.location}` : ''}.`)];
  add({ level: 2, title: 'C.5 Conference presentations (refereed)', kind: 'dated', entries: talks.filter((x) => x.data.category === 'conference').map((x) => ({
    when: monthYear(x.data.date.slice(0, 7)),
    runs: [t(`${talkLabel[x.data.format]}:`, { b: true }), t(` ${quoted(x.data.title)} `), ...venue(x.data), t(`${x.data.note ? ` ${x.data.note}.` : ''}`)],
  })) });
  add({ level: 2, title: 'C.6 Invited lectures and workshops', kind: 'dated', entries: talks.filter((x) => x.data.category === 'invited').map((x) => ({
    when: monthYear(x.data.date.slice(0, 7)),
    runs: [
      t(`${talkLabel[x.data.format]}:`, { b: true }), t(` ${quoted(x.data.title)} `), ...venue(x.data),
      t(`${x.data.host ? ` Invited by ${x.data.host}.` : ''}${x.data.audience ? ` ${x.data.audience}.` : ''}`),
      ...(x.data.url ? [t(' Recording: '), t(x.data.url, { href: x.data.url })] : []),
    ],
  })) });
  // "Journal (Publisher)": the journal in italics, the publisher plain
  const journal = (org = '', href?: string) => {
    const [, name, rest] = org.match(/^(.*?)( \(.*)?$/) ?? [, org, ''];
    return [t(name, { i: true, ...(href ? { href } : {}) }), ...(rest ? [t(rest)] : [])];
  };
  const reviewing = service.filter((s) => s.data.kind === 'reviewer')
    .sort((a, b) => (a.data.organization ?? '').localeCompare(b.data.organization ?? ''));
  const firstReview = reviewing.map((s) => s.data.start ?? '').filter(Boolean).sort()[0];
  add({ level: 2, title: 'C.7 Editorial and reviewer activities', kind: 'dated', entries: [
    ...service.filter((s) => s.data.kind === 'editorial').map((s) => ({
      when: range(s.data.start, s.data.end, true),
      runs: [t(`${s.data.role}, `), ...journal(s.data.organization, s.data.url), t('.')],
    })),
    ...(reviewing.length ? [{
      when: range(firstReview, undefined, true),
      runs: [t('Ad hoc reviewer for '), ...reviewing.flatMap((s, i) => [...(i ? [t('; ')] : []), ...journal(s.data.organization, s.data.url)]), t('.')],
    }] : []),
  ] });
  add({ level: 2, title: 'C.8 Media publicity and public relations', kind: 'dated', entries: media.map((m) => ({
    when: monthYear(m.data.date.slice(0, 7)),
    runs: [
      t(`${mediaLabel[m.data.type]}:`, { b: true }), t(` ${quoted(m.data.title)} `), t(m.data.outlet, { i: true }), t('.'),
      ...(m.data.url ? [t(' '), t(m.data.url, { href: m.data.url })] : []),
    ],
  })) });

  // D. Teaching experience
  add({ level: 1, title: 'D. Teaching experience' });
  add({ level: 2, title: 'D.1 University courses taught' });
  add({ level: 3, title: 'Graduate courses', kind: 'list', entries: teaching.filter((c) => c.data.level === 'graduate').sort(byRecent).map(course) });
  add({ level: 3, title: 'Undergraduate courses', kind: 'list', entries: teaching.filter((c) => c.data.level === 'undergraduate').sort(byRecent).map(course) });
  add({ level: 3, title: 'Teaching assistant', kind: 'list', entries: teaching.filter((c) => c.data.level === 'teaching-assistant').sort(byRecent).map((c) => ({
    runs: [t(`${c.data.title}, ${c.data.role}, ${c.data.institution}${c.data.instructor ? ` (with ${c.data.instructor})` : ''}. `), t(c.data.terms.join(', '), { i: true })],
  })) });
  if (supervision.length) {
    // the student's name goes in the slot; only the private PDF fills it
    const sup = (s: CollectionEntry<'supervision'>): CvEntry => ({
      when: s.data.date?.slice(0, 4) ?? 'Current',
      runs: [
        t(s.data.role), t('', { slot: `student:${s.id}` }),
        t(`${s.data.course ? `, ${s.data.course}` : ''}.${s.data.project ? ` ${s.data.project[0].toUpperCase()}${s.data.project.slice(1)}.` : ''}${s.data.unit ? ` ${s.data.unit}.` : ''}`),
      ],
    });
    add({ level: 2, title: 'D.2 Student supervision' });
    add({ level: 3, title: 'Graduate students', kind: 'dated', entries: supervision.filter((s) => s.data.level === 'graduate').map(sup) });
    add({ level: 3, title: 'Undergraduate students', kind: 'dated', entries: supervision.filter((s) => s.data.level === 'undergraduate')
      .sort((a, b) => (b.data.date ?? '').localeCompare(a.data.date ?? '')).map(sup) });
  }

  // E. Administrative service
  add({ level: 1, title: 'E. Administrative service (University of Toronto)' });
  add({ level: 2, title: '', kind: 'dated', entries: service.filter((s) => s.data.kind === 'administrative').map((s) => ({
    when: range(s.data.start, s.data.end, true), runs: [t(`${s.data.role}${s.data.organization ? `: ${s.data.organization}` : ''}.`)],
  })) });

  return {
    name: `${profile.name}${profile.honorific_suffix ? `, ${profile.honorific_suffix}` : ''}`,
    title_name: `${shortName(profile.given_name, profile.family_name)}${profile.honorific_suffix ? `, ${profile.honorific_suffix}` : ''}`,
    headline: profile.titles.map((x) => [x.role, x.unit, x.organization].filter(Boolean).join(', ')),
    contact: [
      t(profile.email, { href: `mailto:${profile.email}` }),
      ...(orcid ? [t('  ·  ORCID '), t(orcid, { href: profile.links.orcid })] : []),
    ],
    updated: monthYear(new Date().toISOString().slice(0, 7)),
    blocks,
  };
}
