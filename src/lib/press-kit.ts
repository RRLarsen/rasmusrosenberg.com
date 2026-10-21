// The press kit: a ZIP built from the data on every build, so it never goes out of date.
// Bios come from data/profile.yaml; photos and cover from assets/press/ (high resolution,
// kept out of public/ because only the ZIP needs them).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { getProfile, getPublications, getSite } from './data';

export const pressKitPath = '/rasmus-rosenberg-larsen-press-kit.zip';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

let cached: Uint8Array | undefined;

export async function buildPressKit(): Promise<Uint8Array> {
  if (cached && import.meta.env.PROD) return cached; // while previewing, always rebuild so edits show
  const profile = await getProfile();
  const site = (await getSite()).url;
  const book = (await getPublications()).find((p) => p.data.type === 'book' && p.data.featured);
  const dir = join(process.cwd(), 'assets', 'press');
  const images = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));

  const t = profile.titles;
  const wrap = (text: string, width = 76) =>
    text.split(/\s+/).reduce<string[]>((lines, w) => {
      const last = lines.at(-1) ?? '';
      if (last && (last + ' ' + w).length > width) lines.push(w);
      else lines[lines.length ? lines.length - 1 : 0] = last ? `${last} ${w}` : w;
      return lines;
    }, []);
  const describe = (f: string) => {
    const { width, height } = jpegSize(readFileSync(join(dir, f)));
    const what = /-3d\./i.test(f) ? 'Book, 3D image (for event pages, social media, and slides)' : /cover/i.test(f) ? 'Book cover' : /portrait/i.test(f) ? 'Portrait photograph' : /landscape/i.test(f) ? 'Landscape photograph' : 'Image';
    return `  images/${f}\n      ${what}, ${width} × ${height} px`;
  };

  const readme = [
    `PRESS KIT: ${profile.name.toUpperCase()}`,
    '',
    ...t.map((x) => [x.role, x.unit, x.organization].filter(Boolean).join(', ')),
    book ? `Author of ${book.data.title}: ${book.data.subtitle} (${book.data.publisher}, ${book.data.date?.slice(0, 4)})` : '',
    ...(book?.data.website ? [`Book website: ${book.data.website}`] : []),
    '',
    'CONTENTS',
    '',
    '  bio-short.txt',
    `      Short biography, ${words(profile.bio.short)} words. For programmes and bylines.`,
    '  bio-medium.txt',
    `      Medium biography, ${words(profile.bio.medium)} words. For introductions and articles.`,
    '  bio-long.txt',
    `      Long biography, ${words(profile.bio.long)} words. For profiles and event pages.`,
    ...images.map(describe),
    '',
    'CREDITS',
    '',
    `  Photographs: © ${profile.press_kit.photo_credit}`,
    ...(book && profile.press_kit.cover_credit ? [`  Cover of ${book.data.title}: ${profile.press_kit.cover_credit}`] : []),
    '',
    'USE OF THE PHOTOGRAPHS',
    '',
    ...wrap(profile.press_kit.usage).map((l) => `  ${l}`),
    '',
    'CONTACT',
    '',
    `  ${profile.email}`,
    ...profile.address.map((l) => `  ${l}`),
    `  ${site}`,
    '',
  ].join('\n');

  const files: Zippable = {
    'README.txt': strToU8(crlf(readme)),
    'bio-short.txt': strToU8(crlf(profile.bio.short + '\n')),
    'bio-medium.txt': strToU8(crlf(profile.bio.medium + '\n')),
    'bio-long.txt': strToU8(crlf(profile.bio.long + '\n')),
  };
  // JPEGs are already compressed, so store them as they are.
  for (const f of images) files[`images/${f}`] = [readFileSync(join(dir, f)), { level: 0 }];

  cached = zipSync({ 'rasmus-rosenberg-larsen-press-kit': files }, { level: 6, mtime: new Date('2026-01-01') });
  return cached;
}

export const sizeLabel = (bytes: number) =>
  bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;

/** Width and height of a JPEG, read from its frame header. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const length = buf.readUInt16BE(i + 2);
    // SOF0–SOF15 hold the dimensions (except DHT, JPG and DAC markers)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return { width: 0, height: 0 };
}
