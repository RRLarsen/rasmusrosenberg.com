// Builds the PDF CVs with Typst from the CV model that the site build writes to dist/cv.json.
//   public:  public/<cv_pdf> and dist/<cv_pdf>   (no student names; linked from the About page)
//   private: private/rasmus-rosenberg-larsen-cv-private.pdf   (with student names; never uploaded)
// Run by `npm run build`, after `astro build`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = process.cwd();
const model = join(root, 'dist', 'cv.json');
if (!existsSync(model)) throw new Error('dist/cv.json is missing: run `astro build` first');

const profile = parse(readFileSync(join(root, 'data', 'profile.yaml'), 'utf8'));
const publicName = (profile.cv_pdf ?? '/rasmus-rosenberg-larsen-cv.pdf').replace(/^\//, '');
const namesFile = join(root, 'private', 'supervision-names.yaml');
const names = existsSync(namesFile) ? parse(readFileSync(namesFile, 'utf8')) ?? {} : {};

// Typst reads inputs relative to the project root
const work = join(root, 'cv', '.build');
mkdirSync(work, { recursive: true });
copyFileSync(model, join(work, 'cv.json'));
writeFileSync(join(work, 'no-names.json'), '{}');
writeFileSync(join(work, 'names.json'), JSON.stringify(names));

const typst = (namesJson, out) =>
  execFileSync('typst', [
    'compile', 'cv/cv.typ', out,
    '--root', root, '--font-path', 'cv/fonts', '--ignore-system-fonts',
    '--input', 'data=/cv/.build/cv.json', '--input', `names=/cv/.build/${namesJson}`,
  ], { cwd: root, stdio: 'inherit' });

const publicPdf = join(root, 'public', publicName);
typst('no-names.json', publicPdf);
if (existsSync(join(root, 'dist'))) copyFileSync(publicPdf, join(root, 'dist', publicName));
console.log(`CV (public)  → public/${publicName}`);

mkdirSync(join(root, 'private'), { recursive: true });
typst('names.json', join(root, 'private', 'rasmus-rosenberg-larsen-cv-private.pdf'));
console.log(`CV (private) → private/rasmus-rosenberg-larsen-cv-private.pdf${Object.keys(names).length ? '' : ' (no names file found)'}`);
