// What the CV app shows: the CV's sections, where each one's entries live in data/, and the
// form fields for an entry. The order follows the headings of the CV.

export type FieldType =
  | 'text' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox'
  | 'lines' // a list of short texts, one per line
  | 'authors' | 'links' | 'praise' | 'tags' | 'publication'
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
  { name: 'abstract', label: 'Abstract', type: 'textarea' },
  { name: 'description', label: 'Book description (short)', type: 'textarea', help: 'Books only: shown on the home page, and as the abstract on the Research page when there is no abstract.' },
  { name: 'long_description', label: 'Book description (long, Book page)', type: 'textarea', help: 'Books only: shown on the Book page. Separate paragraphs with a blank line; the first paragraph is shown in bold, and *asterisks* mark italics (e.g. the book title). Without it, the Book page uses the short description.' },
  { name: 'note', label: 'Note', type: 'text', help: 'e.g. In Danish; Reprint of …' },
  { name: 'image', label: 'Thumbnail (op-eds)', type: 'text', help: 'A file in public/, e.g. /images/media/x.jpg' },
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
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'outlet', label: 'Outlet or show', type: 'text', required: true },
      date(),
      { name: 'url', label: 'Web address', type: 'text' },
      { name: 'summary', label: 'Short summary', type: 'textarea' },
      { name: 'image', label: 'Thumbnail', type: 'text', help: 'A file in public/, e.g. /images/media/x.jpg' },
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
  { id: 'W.1', group: 'Website', title: 'Home page quotes and intro', collection: 'site', mode: 'object',
    fields: [
      { name: 'quotes', label: 'Quotes (rotating on the home page)', type: 'lines', help: 'One quote per line' },
      { name: 'intro', label: 'Line under the quote', type: 'textarea' },
    ] },
  { id: 'W.2', group: 'Website', title: 'Expertise', collection: 'expertise', mode: 'list', summary: { title: 'title', meta: ['order'] },
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'summary', label: 'Summary', type: 'textarea', required: true }, { name: 'details', label: 'Details', type: 'textarea', help: 'Shown on the Expertise page. *Asterisks* mark italics; [link text](address) makes a link, e.g. [*Psychopathy Unmasked*](/book/).' }, { name: 'order', label: 'Order', type: 'number', required: true }, status] },
  { id: 'W.3', group: 'Website', title: 'Educational resources', collection: 'tools', mode: 'list', summary: { title: 'title', meta: ['updated'] },
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'description', label: 'Description', type: 'textarea', required: true }, { name: 'url', label: 'Web address', type: 'text', required: true }, date('updated', 'Updated', false), status] },
  { id: 'W.4', group: 'Website', title: 'Google Scholar figures', collection: 'scholar', mode: 'object',
    fields: [
      { name: 'publications', label: 'Publications', type: 'number', required: true },
      { name: 'citations', label: 'Citations', type: 'number', required: true },
      { name: 'h_index', label: 'h-index', type: 'number', required: true },
      date('as_of', 'As of'),
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
