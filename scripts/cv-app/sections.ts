// What the CV app shows: the CV's sections, where each one's entries live in data/, and the
// form fields for an entry. The order follows the headings of the CV.

export type FieldType =
  | 'text' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox'
  | 'lines' // a list of short texts, one per line
  | 'authors' | 'links' | 'praise' | 'tags' | 'publication'
  | 'band' // the home page's rotating slides: quotes and promotions of media items or talks
  | 'thumbnail' // an image path with a 16:9 preview, suggestions from the link, upload and crop
  | 'yearmap' // numbers by year, one "2025: 81" per line
  | 'private-name'; // stored in private/, never in data/

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  help?: string;
  /** the value the site assumes when the field is left out (so it need not be written) */
  default?: unknown;
}

export interface Section {
  id: string;
  group: string;
  title: string;
  /** the data file (without .yaml) */
  collection: string;
  /** list: entries in a list; object: one set of fields; yaml: edit the file as text */
  mode: 'list' | 'object' | 'yaml';
  /** for entries inside a file (e.g. profile.yaml → education) */
  path?: string[];
  /** which entries of the collection belong to this section */
  filter?: { field: string; values: string[] };
  /** values given to a new entry in this section */
  defaults?: Record<string, unknown>;
  /** how an entry is summarised in the list */
  summary?: { title: string; meta: string[] };
  fields?: Field[];
  note?: string;
  /** an extra button on the form that calls a server action, e.g. fetching figures */
  action?: { label: string; endpoint: string; help?: string };
}

const status: Field = { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft', 'suggested'], required: true, default: 'published', help: 'Only published entries appear in the CV and on the site.' };
const onWebsite: Field = { name: 'on_website', label: 'Show on the website', type: 'checkbox', default: true, help: 'Untick to keep the entry in the CV only.' };
const featured: Field = { name: 'featured', label: 'Promote on the home page', type: 'checkbox', default: false };
const tags: Field = { name: 'tags', label: 'Topics', type: 'tags' };
const date = (name = 'date', label = 'Date', required = true): Field => ({ name, label, type: 'date', required, help: 'YYYY, YYYY-MM or YYYY-MM-DD' });

const publicationFields = (type: string[]): Field[] => [
  { name: 'type', label: 'Type', type: 'select', options: type, required: true },
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'subtitle', label: 'Subtitle', type: 'text' },
  { name: 'authors', label: 'Authors', type: 'authors', required: true, help: 'In order. Tick "me" for yourself.' },
  date('date', 'Date', false),
  { name: 'stage', label: 'Not yet published', type: 'select', options: ['', 'under contract', 'in press', 'forthcoming'], help: 'Instead of a date.' },
  { name: 'venue', label: 'Journal, book or outlet', type: 'text' },
  { name: 'volume', label: 'Volume', type: 'text' },
  { name: 'issue', label: 'Issue', type: 'text' },
  { name: 'pages', label: 'Pages', type: 'text', help: 'e.g. 297–311' },
  { name: 'editors', label: 'Editors (chapters)', type: 'lines', help: 'One per line, e.g. G. J. Boyle' },
  { name: 'publisher', label: 'Publisher', type: 'text' },
  { name: 'place', label: 'Place of publication', type: 'text' },
  { name: 'doi', label: 'DOI', type: 'text', help: 'e.g. 10.1037/law0000239 (without https://doi.org/)' },
  { name: 'isbn', label: 'ISBN', type: 'text' },
  { name: 'publisher_url', label: 'Web address', type: 'text' },
  { name: 'praise', label: 'Praise (Book page)', type: 'praise', help: 'Books only: endorsements, shown under "Praise" on the Book page. *Asterisks* mark italics, e.g. the book title.' },
  { name: 'website', label: 'Book website', type: 'text', help: 'Books only: the book’s own site, linked on the home page and the Book page' },
  { name: 'pdf', label: 'PDF', type: 'text', help: 'A web address, or a file in public/ such as /papers/x.pdf' },
  { name: 'researchgate', label: 'ResearchGate page', type: 'text', help: 'e.g. https://www.researchgate.net/publication/…  The PDF button links here when there is no direct PDF.' },
  { name: 'abstract', label: 'Abstract', type: 'textarea' },
  { name: 'description', label: 'Book description (short)', type: 'textarea', help: 'Books only: shown on the home page, and as the abstract on the Research page when there is no abstract.' },
  { name: 'long_description', label: 'Book description (long, Book page)', type: 'textarea', help: 'Books only: shown on the Book page. Separate paragraphs with a blank line; the first paragraph is shown in bold, and *asterisks* mark italics (e.g. the book title). Without it, the Book page uses the short description.' },
  { name: 'note', label: 'Note', type: 'text', help: 'e.g. In Danish; Reprint of …' },
  { name: 'image', label: 'Thumbnail (op-eds, and promotions on the home page)', type: 'thumbnail', help: 'Ideal size: 640 × 360 px (16:9), JPEG. A file in public/, e.g. /images/media/x.jpg. Use the buttons to find, upload, or crop one.' },
  tags, onWebsite, featured, status,
];

export const sections: Section[] = [
  // A
  { id: 'A', group: 'A. Personal information', title: 'Profile', collection: 'profile', mode: 'yaml',
    note: 'Name, titles, contact details, links and biographies. Edited as text; checked when you save.' },
  // B
  { id: 'B.1', group: 'B. Academic history', title: 'Education', collection: 'profile', mode: 'list', path: ['education'],
    summary: { title: 'degree', meta: ['field', 'institution', 'date'] },
    fields: [
      { name: 'degree', label: 'Degree', type: 'text', required: true, help: 'e.g. Ph.D.' },
      { name: 'field', label: 'Field', type: 'text', required: true },
      { name: 'institution', label: 'Institution', type: 'text', required: true },
      date('date', 'Date completed', false),
      { name: 'supervisor', label: 'Supervisor', type: 'text' },
    ] },
  { id: 'B.2', group: 'B. Academic history', title: 'Employment and appointments', collection: 'positions', mode: 'list',
    summary: { title: 'title', meta: ['organization', 'start', 'end'] },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'organization', label: 'Organization', type: 'text', required: true },
      { name: 'department', label: 'Department', type: 'text' },
      { name: 'description', label: 'Description', type: 'text' },
      date('start', 'Start', false), date('end', 'End (leave empty if current)', false),
      { name: 'kind', label: 'Kind', type: 'select', options: ['academic', 'affiliation', 'visiting', 'other'], required: true },
      status,
    ], defaults: { kind: 'academic' } },
  { id: 'B.3', group: 'B. Academic history', title: 'Awards and honours', collection: 'awards', mode: 'list',
    summary: { title: 'title', meta: ['date'] },
    fields: [date(), { name: 'title', label: 'Award', type: 'textarea', required: true, help: 'Put *asterisks* around words to set them in italics, e.g. a journal title' }, status] },
  { id: 'B.4', group: 'B. Academic history', title: 'Research grants', collection: 'grants', mode: 'list',
    filter: { field: 'kind', values: ['research'] }, defaults: { kind: 'research' }, summary: { title: 'title', meta: ['date', 'amount'] },
    fields: [date(), { name: 'title', label: 'Grant', type: 'textarea', required: true }, { name: 'amount', label: 'Amount ($)', type: 'number' }, { name: 'url', label: 'Web address', type: 'text' }, { name: 'kind', label: 'Kind', type: 'select', options: ['research', 'scholarship'], required: true }, status] },
  { id: 'B.5', group: 'B. Academic history', title: 'Other grants and scholarships', collection: 'grants', mode: 'list',
    filter: { field: 'kind', values: ['scholarship'] }, defaults: { kind: 'scholarship' }, summary: { title: 'title', meta: ['date', 'amount'] },
    fields: [date(), { name: 'title', label: 'Grant or scholarship', type: 'textarea', required: true }, { name: 'amount', label: 'Amount ($)', type: 'number' }, { name: 'url', label: 'Web address', type: 'text' }, { name: 'kind', label: 'Kind', type: 'select', options: ['research', 'scholarship'], required: true }, status] },
  { id: 'B.6', group: 'B. Academic history', title: 'Memberships', collection: 'memberships', mode: 'list',
    summary: { title: 'organization', meta: ['start', 'end'] },
    fields: [{ name: 'organization', label: 'Association', type: 'text', required: true }, date('start', 'Since'), date('end', 'Until (leave empty if current)', false), status] },
  // C
  { id: 'C.1', group: 'C. Scholarly and professional work', title: 'Research interests', collection: 'profile', mode: 'object', path: ['research_interests'],
    fields: [
      { name: 'specialization', label: 'Areas of specialization', type: 'lines', help: 'One per line' },
      { name: 'competence', label: 'Areas of competence', type: 'lines', help: 'One per line' },
    ] },
  { id: 'C.2', group: 'C. Scholarly and professional work', title: 'Refereed publications', collection: 'publications', mode: 'list',
    filter: { field: 'type', values: ['book', 'article', 'chapter', 'commentary'] }, defaults: { type: 'article', authors: [{ family: 'Larsen', given: 'Rasmus Rosenberg', me: true }] },
    summary: { title: 'title', meta: ['date', 'stage', 'venue'] }, fields: publicationFields(['book', 'article', 'chapter', 'commentary']) },
  { id: 'C.3', group: 'C. Scholarly and professional work', title: 'Other publications', collection: 'publications', mode: 'list',
    filter: { field: 'type', values: ['op-ed', 'other', 'review'] }, defaults: { type: 'op-ed', authors: [{ family: 'Larsen', given: 'Rasmus Rosenberg', me: true }] },
    summary: { title: 'title', meta: ['date', 'venue'] }, fields: publicationFields(['op-ed', 'review', 'other']) },
  { id: 'C.4', group: 'C. Scholarly and professional work', title: 'Manuscripts in progress', collection: 'manuscripts', mode: 'list',
    summary: { title: 'title', meta: ['stage', 'kind'] },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'kind', label: 'Kind', type: 'select', options: ['article', 'book'], required: true },
      { name: 'stage', label: 'Stage', type: 'select', options: ['in preparation', 'in review'], required: true },
      { name: 'coauthors', label: 'Co-authors', type: 'lines', help: 'One per line, full names' },
      status,
    ], defaults: { kind: 'article', stage: 'in preparation' } },
  { id: 'C.5', group: 'C. Scholarly and professional work', title: 'Conference presentations', collection: 'talks', mode: 'list',
    filter: { field: 'category', values: ['conference'] }, defaults: { category: 'conference', format: 'presentation' },
    summary: { title: 'title', meta: ['date', 'event'] }, fields: talkFields() },
  { id: 'C.6', group: 'C. Scholarly and professional work', title: 'Invited lectures and workshops', collection: 'talks', mode: 'list',
    filter: { field: 'category', values: ['invited'] }, defaults: { category: 'invited', format: 'lecture' },
    summary: { title: 'title', meta: ['date', 'event'] }, fields: talkFields() },
  { id: 'C.7', group: 'C. Scholarly and professional work', title: 'Editorial and reviewer activities', collection: 'service', mode: 'list',
    filter: { field: 'kind', values: ['editorial', 'reviewer'] }, defaults: { kind: 'reviewer' }, summary: { title: 'organization', meta: ['role', 'start', 'end'] },
    fields: serviceFields(['editorial', 'reviewer']) },
  { id: 'C.8', group: 'C. Scholarly and professional work', title: 'Media', collection: 'media', mode: 'list',
    summary: { title: 'title', meta: ['date', 'outlet'] },
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['interview', 'podcast', 'radio', 'press', 'video', 'review', 'other'], required: true },
      { name: 'title', label: 'Title', type: 'text', required: true, help: 'Put *asterisks* around a book title to set it in italics.' },
      { name: 'outlet', label: 'Outlet or show', type: 'text', required: true },
      date(),
      { name: 'url', label: 'Web address', type: 'text' },
      { name: 'summary', label: 'Short summary', type: 'textarea' },
      { name: 'image', label: 'Thumbnail', type: 'thumbnail', help: 'Ideal size: 640 × 360 px (16:9), JPEG. A file in public/, e.g. /images/media/x.jpg. Use the buttons to find, upload, or crop one.' },
      { name: 'publication', label: 'About which publication', type: 'publication', help: 'For reviews of a book or article' },
      tags, onWebsite, featured, status,
    ], defaults: { type: 'interview' } },
  // D
  { id: 'D.1', group: 'D. Teaching experience', title: 'Courses and teaching', collection: 'teaching', mode: 'list',
    summary: { title: 'title', meta: ['code', 'level'] },
    fields: [
      { name: 'title', label: 'Course title', type: 'text', required: true },
      { name: 'code', label: 'Course code', type: 'text' },
      { name: 'level', label: 'Level', type: 'select', options: ['undergraduate', 'graduate', 'continuing-education', 'teaching-assistant', 'other'], required: true },
      { name: 'institution', label: 'Institution', type: 'text' },
      { name: 'terms', label: 'Terms taught', type: 'lines', help: 'One per line, e.g. Fall 2025' },
      { name: 'description', label: 'Course description (Teaching page)', type: 'textarea', help: '*Asterisks* mark italics, e.g. a book title.' },
      date('date', 'Date (continuing education)', false),
      { name: 'url', label: 'Web address (continuing education)', type: 'text' },
      { name: 'role', label: 'Role (teaching assistant)', type: 'text' },
      { name: 'instructor', label: 'Instructor (teaching assistant)', type: 'text' },
      onWebsite, status,
    ], defaults: { level: 'undergraduate', institution: 'University of Toronto Mississauga' } },
  { id: 'D.2', group: 'D. Teaching experience', title: 'Student supervision', collection: 'supervision', mode: 'list',
    summary: { title: 'role', meta: ['date', 'course', 'level'] },
    fields: [
      { name: 'level', label: 'Level', type: 'select', options: ['undergraduate', 'graduate'], required: true },
      { name: 'role', label: 'Role', type: 'text', required: true, help: 'e.g. Research internship; Member of PhD Committee' },
      { name: 'student', label: 'Student name (private)', type: 'private-name', help: 'Kept in private/, only in your private PDF' },
      { name: 'course', label: 'Course', type: 'text' },
      { name: 'project', label: 'Project', type: 'text' },
      { name: 'unit', label: 'Department or programme', type: 'text' },
      date('date', 'Year (leave empty if current)', false),
      status,
    ], defaults: { level: 'undergraduate', role: 'Research internship' } },
  // E
  { id: 'E', group: 'E. Administrative service', title: 'Administrative service', collection: 'service', mode: 'list',
    filter: { field: 'kind', values: ['administrative'] }, defaults: { kind: 'administrative' }, summary: { title: 'role', meta: ['organization', 'start'] },
    fields: serviceFields(['administrative']) },
  // Website
  { id: 'W.1', group: 'Website', title: 'Home page: quotes, promotions, intro', collection: 'site', mode: 'object',
    fields: [
      { name: 'description', label: 'Site description (search engines and link previews)', type: 'textarea', required: true, help: 'Plain text, about two sentences.' },
      { name: 'band', label: 'Rotating slides (up to 8, in this order)', type: 'band', required: true, help: 'Each slide is a quote, or a promotion of a media item, a research publication, or an upcoming talk. Untick "Show" to keep a slide here without showing it. Promoted talks disappear after their date.' },
      { name: 'band_seconds', label: 'Seconds per slide', type: 'number', required: true, help: 'How long each slide is shown before the next (3–60; standard 10).' },
      { name: 'intro', label: 'Line under the quote', type: 'textarea' },
    ] },
  { id: 'W.1b', group: 'Website', title: 'Page introductions', collection: 'site', mode: 'object', path: ['pages'],
    note: 'The short text under each page heading (and on the Contact and Expertise pages, the enquiry note).',
    fields: [
      { name: 'research', label: 'Research', type: 'textarea', required: true },
      { name: 'media', label: 'Media', type: 'textarea', required: true },
      { name: 'expertise', label: 'Expertise', type: 'textarea', required: true },
      { name: 'expertise_contact', label: 'Expertise: enquiry note', type: 'textarea', required: true },
      { name: 'about', label: 'About', type: 'textarea', required: true },
      { name: 'teaching', label: 'Teaching', type: 'textarea', required: true },
      { name: 'contact', label: 'Contact', type: 'textarea', required: true },
      { name: 'book', label: 'Book (search engines and link previews)', type: 'textarea', required: true },
      { name: 'tools', label: 'Tools', type: 'textarea', required: true },
    ] },
  { id: 'W.1c', group: 'Website', title: 'Biographies', collection: 'profile', mode: 'object', path: ['bio'],
    note: 'Used on the About page (long), the home page (medium), in page descriptions (short), and in the press kit (all three).',
    fields: [
      { name: 'short', label: 'Short biography', type: 'textarea', required: true, help: 'One or two sentences. *Asterisks* mark italics (e.g. the book title).' },
      { name: 'medium', label: 'Medium biography', type: 'textarea', required: true },
      { name: 'long', label: 'Long biography', type: 'textarea', required: true, help: 'Separate paragraphs with a blank line.' },
    ] },
  { id: 'W.2', group: 'Website', title: 'Expertise', collection: 'expertise', mode: 'list', summary: { title: 'title', meta: ['order'] },
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'summary', label: 'Summary', type: 'textarea', required: true }, { name: 'details', label: 'Details', type: 'textarea', help: 'Shown on the Expertise page. Separate paragraphs with a blank line. *Asterisks* mark italics; [link text](address) makes a link, e.g. [*Psychopathy Unmasked*](/book/).' }, { name: 'order', label: 'Order', type: 'number', required: true }, status] },
  { id: 'W.3', group: 'Website', title: 'Educational resources', collection: 'tools', mode: 'list', summary: { title: 'title', meta: ['updated'] },
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'description', label: 'Description', type: 'textarea', required: true }, { name: 'url', label: 'Web address', type: 'text', required: true }, date('updated', 'Updated', false), status] },
  { id: 'W.4', group: 'Website', title: 'Google Scholar figures', collection: 'scholar', mode: 'object',
    note: 'Refreshed from your public Google Scholar profile every Friday (or the next time the dashboard runs). The publication count on the Research page comes from your publication list, not Scholar.',
    action: { label: 'Update from Google Scholar', endpoint: 'scholar/update', help: 'Reads your public profile page once and fills in the figures.' },
    fields: [
      { name: 'citations', label: 'Citations', type: 'number', required: true },
      { name: 'h_index', label: 'h-index', type: 'number', required: true },
      { name: 'i10_index', label: 'i10-index', type: 'number' },
      { name: 'citations_per_year', label: 'Citations per year', type: 'yearmap', help: 'One year per line, e.g. 2025: 81' },
      date('as_of', 'As of'),
    ] },
  { id: 'W.6', group: 'Website', title: 'Journal pictures', collection: 'journals', mode: 'list', summary: { title: 'name', meta: [] },
    note: 'The default picture when a publication in this journal is promoted on the home page (unless the publication has its own thumbnail). Matched on the publication’s journal name or an alias.',
    fields: [
      { name: 'name', label: 'Journal name', type: 'text', required: true, help: 'Exactly as in your publications, e.g. Psychology, Public Policy, and Law' },
      { name: 'aliases', label: 'Other spellings', type: 'lines', help: 'One per line, e.g. without "The"' },
      { name: 'image', label: 'Picture', type: 'thumbnail', help: 'Ideal size: 640 × 360 px (16:9), JPEG. A tile with the cover and name can be made with scripts/images/journal-tile.typ, or upload and crop a cover or logo here.' },
    ] },
  { id: 'W.5', group: 'Website', title: 'Topics (tags)', collection: 'tags', mode: 'list', summary: { title: 'label', meta: [] },
    fields: [{ name: 'label', label: 'Label', type: 'text', required: true }, { name: 'description', label: 'Description', type: 'text' }] },
];

function talkFields(): Field[] {
  return [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'event', label: 'Event', type: 'textarea', required: true, help: 'The conference, workshop or series; set in italics in the CV' },
    { name: 'location', label: 'Place', type: 'text', help: 'e.g. University of Copenhagen; Spoleto, Italy' },
    date(),
    { name: 'format', label: 'Format', type: 'select', options: ['presentation', 'keynote', 'poster', 'panel', 'lecture', 'talk'], required: true },
    { name: 'category', label: 'CV section', type: 'select', options: ['conference', 'invited'], required: true },
    { name: 'host', label: 'Invited by', type: 'text' },
    { name: 'audience', label: 'Audience', type: 'text', help: 'e.g. Undergraduate lecture' },
    { name: 'note', label: 'Note', type: 'text', help: 'e.g. Symposium; Postponed' },
    { name: 'url', label: 'Recording or web address', type: 'text' },
    tags, featured, status,
  ];
}

function serviceFields(kinds: string[]): Field[] {
  return [
    { name: 'role', label: 'Role', type: 'text', required: true },
    { name: 'organization', label: 'Journal, committee or unit', type: 'text' },
    date('start', 'From'),
    date('end', 'Until (leave empty if ongoing; same year for a single year)', false),
    { name: 'url', label: 'Web address', type: 'text' },
    { name: 'kind', label: 'Kind', type: 'select', options: kinds.length > 1 ? kinds : ['editorial', 'reviewer', 'administrative'], required: true },
    status,
  ];
}
