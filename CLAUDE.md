# rasmusrosenberg.com — project brief

Personal academic website for Rasmus Rosenberg Larsen (Associate Professor, University of Toronto Mississauga; forensic epistemology, philosophy of science). Replaces a Wix site. Built locally first, then hosted on GitHub Pages (public repo) with custom domains.

## Core principle: data is the single source of truth

All content lives in structured files in `data/`. Pages, the PDF CV, bios and feeds are **generated** from that data. Nothing about publications, talks, media, positions or bio is hard-coded in templates.

The future "CV app" will be an editor for these same files, not a separate database. Any decision that would make that harder is wrong.

## Stack

- **Astro** static site, using content collections with **Zod schemas**, so invalid data fails the build.
- **YAML** data files in `data/`. Markdown for long-form posts.
- **Typst** for the PDF CV, generated from the same data.
- **GitHub Actions** for the build and deploy to GitHub Pages, plus scheduled jobs that fetch external data.
- No client-side framework unless a feature needs one. No third-party trackers. Plausible or GoatCounter later, if analytics are wanted.

## Repository layout (target)

```
data/
  profile.yaml        # name, titles, affiliations, short/medium/long bios, links (Scholar, ORCID, PhilPapers, LinkedIn, Bluesky, YouTube, GitHub)
  positions.yaml
  publications.yaml   # books, articles, chapters, reviews
  talks.yaml
  media.yaml          # interviews, podcasts, press mentions
  teaching.yaml
  grants.yaml
  service.yaml
posts/                # newsletter/essays (Markdown)
generated/            # written by fetch scripts only; never hand-edited (metrics, feed caches)
scripts/
  fetch/              # one script per external source (openalex, youtube, newsletter-rss, alerts)
cv/                   # Typst templates
src/                  # Astro site
```

## Data model rules

- Every record has a stable `id` (slug) and a `status: published | draft | suggested`. Only `published` renders. `suggested` is for entries proposed by fetchers and waiting for approval in the future inbox.
- Publications carry identifiers where they exist (`doi`, `isbn`, `openalex_id`, `philpapers_id`) plus links (`publisher_url`, `oa_url` for PhilArchive/preprint). External data is matched on these, never on title strings.
- Dates are ISO (`YYYY-MM-DD`, or `YYYY-MM` / `YYYY` when only the month or year is known).
- `tags` (controlled list) on publications, talks and media, so the site can filter by topic.
- `featured: true` lets an item surface on the homepage.
- Fetchers write only to `generated/` or append `suggested` records. They never modify `published` records.

## Features, built in phases

Status as of 2026-10-21. Details of each are in the decisions below.

1. **Foundation: done.** Content migrated from the Wix site; schemas; pages: Home, Research (publications with abstract, PDF and cite), Book, Blog & Media, Expertise, About (with the full CV), Teaching, Tools, Contact, 404, redirects from old Wix addresses. Schema.org JSON-LD (Person, ScholarlyArticle, Book). Correct metadata: he is an **Associate** Professor.
2. **PDF CV: done.** Typst, built from `data/` on every build; public and private versions; linked from the About page.
3. **Press kit: done.** A ZIP built from the data (three bios, photographs, book cover and 3D image), linked from Blog & Media. The original plan said 50-, 150- and 300-word bios; the current ones are about 30, 65 and 145 words.
4. **External data: done differently.** Instead of a scheduled GitHub Action writing metrics, the local dashboard checks online sources every Friday: Google Scholar figures (citations, h-index; OpenAlex counts were too low to show) and the suggestions inbox (OpenAlex, Crossref, ORCID, YouTube, Google Alerts, Google News, Apple Podcasts). Newsletter RSS is not built.
5. **Writing/newsletter: not started.** The Blog section on Blog & Media is ready for posts (Markdown in `posts/`); syndication to Bluesky and LinkedIn is not built.
6. **Suggestion inbox: done** (in the dashboard; suggestions are cached in `generated/inbox.json`, not written to `data/` as `suggested` records).
7. **CV app: done as a custom app**, not Sveltia/Decap: the dashboard with the CV Builder and Website Editor (`npm run dashboard`).
8. **Book site: later.** psychopathyunmasked.com as a second output from the same repo and data (book reviews, media, events). Keep shared data and components separate from site-specific pages so it stays possible.

## Hosting and domains

- Public GitHub repo (`rrlarsen/rasmusrosenberg.com`), deployed to GitHub Pages through Actions. The main address is **https://www.rasmusrosenberg.com** (`data/site.yaml: url`, `astro.config.mjs: site`); rasmusrosenberg.com without www redirects to it.
- psychopathyunmasked.com stays on Wix until the book site is built.
- The domains are registered with Wix and the subscriptions run for about another year. At launch, point the rasmusrosenberg.com DNS at GitHub Pages; transfer to a cheaper registrar at renewal.
- Everything in the repo is public, so never commit drafts not meant for the public, credentials or private notes. API keys go in GitHub Actions secrets. `private/` (student names, the private PDF, the original CV document) is git-ignored and must be backed up separately.
- Licence: code under MIT; content (texts, data, photographs, images) all rights reserved (`LICENSE`).

## Working conventions

- Make small, incremental changes. Each phase should leave the site working.
- Run the build locally and preview (`npm run dev`) before declaring something done.
- Schema changes need a migration of the existing data files in the same change.
- After changing `src/content.config.ts`, restart `npm run dev`: Astro's dev server keeps validating against the old schema until it restarts. Builds are unaffected.
- Design: clean, typographic, academic; fast; accessible (WCAG AA); works on mobile; light and dark modes.
- Writing on the site: clear, direct, evidence-led. Owner signs as "Rasmus".

## Decisions (2026-10-07)

- **Pages:** keep the Wix Consultancy page as an `/expertise` page (data in `data/expertise.yaml`; named so it is not confused with academic `service.yaml`), and keep a `/tools` page (data in `data/tools.yaml`; the Exam Timer lives at rrlarsen.github.io/Exam-Timer).
- **Repo:** GitHub account `rrlarsen`. The site repo is named `rasmusrosenberg.com`, not `rrlarsen.github.io`, so other GitHub Pages projects stay where they are.
- **Old URLs:** use clean paths (`/book`, `/expertise`, `/tools`) and add redirect pages for the old Wix paths (`/general-4` → `/book`, `/services-7` → `/expertise`, `/services-7-1` → `/tools`, `/home` → `/`).
- **Design:** the Wix site is only a content source, not a design template. Expect to try several redesigns, so keep styling in design tokens and layout components that are easy to swap.
- **Contact:** an email link only, with no contact form.
- **Social links shown:** LinkedIn, ResearchGate, Google Scholar, YouTube. Other identifiers (e.g. ORCID) can live in `profile.yaml` for metadata without being displayed.

## Design and structure decisions (2026-10-16)

- **Design: "Turquoise"** (mockup `design/b-turquoise.html`). Chosen for its balance: central information up front without overwhelming the visitor with options. Keep that restraint when adding features.
  - Colours: dark turquoise green `#0f3b39` field with off-white `#ecebe5` type; paper `#f3f2ee` with ink `#142624` for content; links `#165b56`. Dark mode moves the whole page onto deep turquoise.
  - Type: Newsreader (serif, for reading and headings), Hanken Grotesk (sans, for navigation, metadata and small text). Self-host the fonts in the real build, not Google Fonts.
  - Layout: left-aligned editorial grid. Section title in a narrow left column, content in a wide right column. The turquoise band holds the header, the opening quote and three entry points (Research, Book, Expertise); the footer repeats the band with contact details.
  - Person present but restrained: name as a small wordmark in the header (capitals and small capitals with two hairline rules, `src/components/Wordmark.astro`); portrait beside the quote on the home page and in About.
- **Structure: multi-page site with a short scrolling home page.** The home page is an overview (statement, book, selected publications, expertise, about, contact), each section linking to its full page. Separate pages: About, Research/Publications, Book, Talks & Media, Teaching, Expertise, Press kit, Contact, plus the CV PDF. Shareable URLs and search visibility are the reasons.
- **Features borrowed from other mockups (proposed, awaiting approval):** the publications page gets the filter (type, topic) and cite/BibTeX tool from `design/f-casebook.html`. The research-questions format from `design/e-questions.html` is a possible later addition, not part of the home page now.
- **Menu (2026-10-16, revised 2026-10-23):** a home icon ("Home" in the phone menu), then Research, Expertise, Media, Teaching, About, Contact. The Blog & Media page is now Media at `/media/` (`/blog-media/` redirects). No Book item: the book appears on the home page and in the Research list, and keeps its own page at `/book/` (linked from both).
- **Home band:** Rasmus's quote (`site.yaml: quote`) with his portrait beside it, and the intro line (`site.yaml: intro`) under the quote.
- **Research page:** a description of research interests, Google Scholar figures (publications, citations, h-index, citations per year) and one list of all academic publications. Op-eds go under Blog & Media. **Publications** is counted from `data/` (published books, articles, chapters, and commentaries; `countedTypes` in `src/lib/data.ts`), not from Scholar, whose count includes pre-registrations and other non-refereed entries. Citations, h-index, i10-index, and citations per year live in `data/scholar.yaml`. **Decision (2026-10-21):** the dashboard refreshes them from the public Scholar profile (`scripts/cv-app/scholar.ts`) with strict limits: the profile page only (robots.txt allows `/citations?user=`; no searches or paging), from Rasmus's laptop only (never a server or GitHub Action), once a week (Fridays, `scripts/cv-app/schedule.ts`; a missed Friday is caught up when the dashboard next runs) or on the "Update from Google Scholar" button; a robot check or changed page writes nothing and shows a notification. Hand editing in the Website Editor stays possible.
- **About page:** biography plus the CV, rendered from `data/` in a scrolling frame and styled like the PDF (title, one typeface, ruled headings, numbered publications; `src/components/CvDocument.astro`), with links to the PDF CV (`profile.yaml: cv_pdf`, shown only once the file exists in `public/`), Google Scholar and ResearchGate.
- **Publications** are shown as APA references. Under each: Abstract (expands), PDF (the `pdf` link, a legal open-access copy; otherwise the work's `researchgate` page, labelled just “PDF” for simplicity), and “Cite” (a RIS file at `/research/ris/<id>.ris`). The Research page has two groups: Books (including `stage: under contract`) and Peer-reviewed articles and chapters (types article, chapter, commentary). Book reviews appear only in the CV.
- **Press kit:** `/rasmus-rosenberg-larsen-press-kit.zip`, generated on every build from `profile.yaml` (three bios) and `assets/press/` (high-resolution photos and book cover), linked at the top of Blog & Media.
- **Book retailers** are the book's `links` in `publications.yaml`: the first is the main "Order from" button, the rest go in a "More retailers" menu (`src/components/BuyLinks.astro`).
- **SEO:** sitemap (`@astrojs/sitemap`, `sitemap-index.xml`), `public/robots.txt`, canonical URLs, Open Graph and Twitter tags, schema.org JSON-LD. Possible next step: one page per publication with Google Scholar `citation_*` meta tags.
- **Contact:** a separate Contact page (email, enquiry note, office address, profiles). The footer is one slim line: email, profile links, copyright.
- **Inline markup in data text:** `*asterisks*` for italics and `[link text](address)` for links, rendered by `src/components/Emph.astro` (book descriptions, praise, expertise details, course descriptions, bios, media titles; in the CV via `emphRuns`). `plain()` in `src/lib/data.ts` strips the markup for metadata and the press kit. The book title is italic in running text and inside other titles, but not in headings, alt text, metadata or the title of the invited talk named after the book.
- **External links** open in a new tab: `src/middleware.ts` adds `target="_blank" rel="noopener"` and a screen-reader note "(opens in a new tab)" to every link to another site, on every page (templates, data and generated HTML alike). Links within the site and email links are unchanged.
- **Dark mode** follows the visitor's device setting automatically; there is no toggle.
- **Home band rotation (revised 2026-10-23):** an ordered list of up to 8 slides in `site.yaml: band`, each `{ quote: … }`, `{ media: <media id> }` or `{ talk: <talk id> }` (talks show only until their date); `show: false` keeps a slide in the list but out of the rotation (at least one must show). `site.yaml: band_seconds` sets how long each slide is shown (default 10). Edited in the Website Editor as one box per slide (type, text or a chosen item, a Show checkbox, move up/down, remove), plus the seconds per slide. Promotions are normalised in `src/lib/promotions.ts` (`getBand`) and drawn by `src/components/Promo.astro` (16:9 image frame or tile, title, a standard description sentence per record type such as "Dr. Larsen was a guest on …, <date>.", one action link). `featured: true` on media no longer decides the band. Quotes stay unboxed: no panels or translucent backgrounds in the band. They rotate every `band_seconds` seconds (not with reduced motion) and can be picked with dots; picking one stops the rotation. On phones the quotes are centred in the band's height and the portrait follows the band, full width.
- **Teaching page:** University courses as `Title (CODE)` with the description in an opener, grouped as Science courses (FSC) then Philosophy courses (PHL), each in order of course code with graduate courses first; graduate courses carry a small label. Then Continuing education (`level: continuing-education`, with a `date`) and Educational resources (`tools.yaml`). Courses with the same content under different titles are merged into one entry; internships are kept as drafts (in the data, not on the site).
- **Footer link order:** LinkedIn, Google Scholar, ResearchGate, YouTube (`profile.yaml: show_links`).
- **Media page** (`/media/`, formerly Blog & Media): Media, then Op-eds and commentary, then Blog. Each list shows four items with "Show more". Items show thumbnail, title, outlet and a short summary, not APA. Thumbnails are stored in `public/images/media/` at **640 × 360 px (16:9) JPEG**, named after the entry's id; items without one get a turquoise tile with the outlet name. The CV Builder's thumbnail field shows a 16:9 preview, suggests images from the entry's web page (og:image and large article images), takes uploads, and crops in a 16:9 frame, saving 640 × 360 JPEGs (`/api/image/suggest`, `/api/image/fetch`, `/api/image/save`).
- `design/` holds the mockups and the cropped images they use. It is reference material, not part of the site.

## CV builder plan (agreed 2026-10-17)

A local app in the browser (`npm run cv`, never published) that edits the same `data/` files the site uses. Only Rasmus edits. Laptop only for now.

- **Output:** the full academic CV as PDF (Typst), following the headings of his original CV: A Personal information; B Academic history (education, employment, awards, research grants, other grants and scholarships, memberships); C Scholarly work (research interests, refereed publications, other publications, manuscripts in progress, conference presentations, invited lectures, editorial and reviewer activities, media); D Teaching (courses with the terms taught, teaching assistant work, supervision); E Administrative service. Entries use the most suitable format (APA for publications). ORCID iD on the CV. No private details (date of birth etc.).
- **Add new entry:** choose the section, fill in a form, validated against the schemas as you type.
- **Quick add by identifier:** DOI, ISBN or web address is looked up and fills the form. No free-text parsing (no LLM/API) unless it becomes relevant.
- **Suggestions inbox:** new publications (OpenAlex/ORCID/Crossref, ORCID 0000-0002-9294-8645), media mentions (Google Alerts RSS) and YouTube videos arrive as `status: suggested`; nothing is added without approval.
- **One update, everywhere:** saving updates the PDF download, the CV on the About page and the website pages. Save = git commit; Publish = push (once on GitHub).
- **Website vs CV:** some entries are CV-only (`on_website: false`), e.g. internships, teaching assistant work. Some CV sections are never shown as separate website sections (conference presentations, invited lectures, awards, grants, memberships, editorial work, supervision, service); they appear only in the CV. Student names are never in the public data: they live in `private/supervision-names.yaml` (git-ignored; back it up separately), keyed by neutral supervision ids. Two PDFs: a public one without names (linked from the site) and a private one with names for Rasmus only. The About page CV never shows names. Merged courses appear merged in the CV too, with all terms listed.
- **Status:** step 1 done (2026-10-17): all CV sections are in `data/` (talks, awards, grants, memberships, manuscripts, service, supervision, teaching incl. TA work, positions, education, research interests) and the About page shows the full CV with the original headings.
- **Step 2 done (2026-10-18):** `npm run build` = `astro build` + `scripts/cv/build-pdf.mjs`. The CV model lives in `src/lib/cv.ts` (used by the About page and exported as `/cv.json`); `cv/cv.typ` renders it with Typst (fonts in `cv/fonts/`, OFL). Outputs: `public/rasmus-rosenberg-larsen-cv.pdf` (public, no student names; git-ignored, regenerated on every build) and `private/rasmus-rosenberg-larsen-cv-private.pdf` (with names). APA formatting lives once in `src/lib/cite.ts` as styled runs (`apaRuns`), rendered to HTML or Typst.
- **Step 3 done (2026-10-18):** the CV app. `npm run cv` starts `scripts/cv-app/server.ts` on http://localhost:4400 (127.0.0.1 only) and opens it. Sections and form fields are defined in `scripts/cv-app/sections.ts`; validation uses the shared rules in `src/schemas.ts` (also used by `src/content.config.ts`). Saving replaces only the edited entry's text in the YAML file (everything else stays byte-for-byte, so hand edits and the app coexist; unchanged saves write nothing), then runs `npm run build` to refresh the PDFs and the site. Student names are edited in the app but stored only in `private/supervision-names.yaml`. "Checkpoint" commits `data/` with git.
- **PDF layout (2026-10-19, revised 2026-10-21):** one typeface throughout, Hanken Grotesk at 10pt. Page 1 has only the update date in the header and a centred turquoise title "Curriculum Vitae: Rasmus R. Larsen, Ph.D." (`title_name`, derived from `profile.yaml`); later pages carry name and update date in the header; the footer is the page number alone. Subsection titles (B.1 …) are turquoise semibold; group subtitles (Books, Graduate courses …) are turquoise bold, not italic. C.4 lists books first, then articles and chapters. The CV app previews the PDF with pdf.js (`scripts/cv-app/public/preview.html`) so links open in a new tab. Entries never split across pages and sections of up to five entries move as a whole. Refereed publications are numbered counting down. Talks have `event` (italic in the CV) and optional `location`. Books with a `stage` (e.g. under contract) stay in the website's Books list but go under C.4 manuscripts in the CV. Reviewer roles are combined into one "Ad hoc reviewer for …" entry. In award titles, `*asterisks*` mark italics. The old "Forensic Science Program" is always called the Institute of Forensic Sciences.
- **Steps 4–6 done (2026-10-21):**
  - **Quick add** (top bar): a DOI (Crossref), ISBN (Open Library, then Google Books) or web address (the page's citation or Open Graph metadata; a DOI found there goes through Crossref) opens a filled-in, unsaved form in the right section. Web pages that are not scholarly become Media (C.8) or, if chosen, an op-ed (C.3). Code: `scripts/cv-app/lookup.ts`.
  - **Duplicates:** matched on DOI, ISBN and web address only ("already in your CV"). A title match is only shown as a hint ("may already be in your CV"), with a button to add the DOI to that entry so identifiers do the matching from then on.
  - **Suggestions inbox** (`scripts/cv-app/inbox.ts`): OpenAlex, Crossref and ORCID (by the ORCID iD in `profile.yaml`), the YouTube channel's feed, Google Alerts RSS feeds, and searches (`data/inbox.yaml: searches`) run on Google News (links decoded to the article's own address, cached in `generated/inbox.json`; this uses an unofficial Google endpoint that may change) and the Apple Podcasts episode search (kept only when every phrase and word of the search appears; prefilled as a podcast entry). Checked every Friday (the dashboard catches up a missed Friday and, when left open, looks hourly), or with "Check now". Decision: suggestions are not written into `data/` as `status: suggested` records; they are cached in `generated/inbox.json` (git-ignored), approving opens a filled-in form, and an approved item leaves the inbox because its identifier is now in `data/`. Dismissed identifiers and the YouTube channel id are in `data/inbox.yaml`. Google Alerts feed addresses are tied to his Google account, so they live in `private/alerts.yaml`. The ORCID public record currently lists no works.
  - **Saving** now changes only the lines of the fields that differ (falls back to rewriting the entry for one-line `{ … }` entries), so hand-written style and comments survive.
  - **Publish** (top bar): checkpoints `data/` if needed, then `git push` (sets the upstream on first push). Until the repo has a GitHub remote it says so and does nothing. Deploying on push needs the GitHub Actions workflow, part of going live.
- **Dashboard (2026-10-21):** `npm run dashboard` (or `npm run cv`) serves http://localhost:4400; starting it again opens the running one. `/` is the dashboard (`scripts/cv-app/public/dashboard.*`): a banner with the name wordmark (as on the website, `wordmark.*`), a breadcrumb ("Dashboard", or "Dashboard › CV Builder" in an editor; the logo cell lines up with the left column below), and the Checkpoint and Publish buttons; a **Notifications** feed on the left (from `GET /api/status`: unsaved changes, unpublished checkpoints, failed builds, unreachable sources, and new suggestions linking to `/cv#inbox:<key>`; future tools add their notices there); and tiles for the **CV Builder** (`/cv`: sections A–E and the inbox; buttons for the public and private PDF) and the **Website Editor** (`/website`: the same app showing the Website sections; Open Website starts `astro dev` on port 4321 if needed, as a child of the dashboard that stops with it). Single-form sections save line by line (comments and wrapping kept), and changed long text is written as a wrapped `>-` block. New tools are added as tiles.
- **Build order:** (1) complete the data from the CV; (2) Typst PDF CV; (3) app v1: browse, add, edit, delete, live PDF preview, save; (4) quick add by DOI/ISBN/address; (5) suggestions inbox; (6) Publish button.
