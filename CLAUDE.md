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

1. **Foundation:** migrate current content from the Wix site (Home, About, Author, CV, Tools, Contact), define schemas, build the pages: Home, About, Publications (filterable, cite/BibTeX button), Talks, Media, Teaching, Book, Contact. Add schema.org JSON-LD (Person, ScholarlyArticle, Book). Use correct metadata: he is an **Associate** Professor (the old Wix meta description wrongly says Assistant).
2. **PDF CV:** a Typst CV built from `data/` on every build and linked from the CV page.
3. **Press kit page:** 50, 150 and 300-word bios, headshots, book cover, comment topics, contact. All generated from the data.
4. **External data (scheduled GitHub Action, weekly):**
   - OpenAlex: citation counts per work, total citations, h-index, written to `generated/metrics.json` with a "last updated" date. Link out to the Google Scholar profile (Scholar has no API, so don't scrape it).
   - YouTube channel RSS feed → media/videos.
   - Newsletter RSS (Buttondown or Substack) → posts listing.
5. **Writing/newsletter:** publish on the site (or a newsletter platform with RSS), syndicate links to Bluesky and LinkedIn.
6. **Suggestion inbox:** fetchers propose `suggested` records (new DOIs via ORCID/OpenAlex/Crossref, Google Alerts RSS for media mentions), and he approves or rejects them.
7. **CV app:** a local or hosted editor UI over `data/` (start with Sveltia/Decap CMS, custom app later if needed).
8. **Book site:** psychopathyunmasked.com as a second output from the same repo and data (book reviews, media, events). Design for this from the start: keep shared data and components separate from site-specific pages.

## Hosting and domains

- Public GitHub repo, deployed to GitHub Pages through Actions, with custom domains rasmusrosenberg.com and psychopathyunmasked.com.
- The domains are registered with Wix and the subscriptions run for about another year. At launch, point DNS at GitHub Pages; transfer to a cheaper registrar at renewal.
- Everything in the repo is public, so never commit drafts not meant for the public, credentials or private notes. API keys go in GitHub Actions secrets.

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
- **Menu (2026-10-16):** Research, Blog & Media, Expertise, About, Teaching, Contact. No Book item: the book appears on the home page and in the Research list, and keeps its own page at `/book/` (linked from both).
- **Home band:** Rasmus's quote (`site.yaml: quote`) with his portrait beside it, and the intro line (`site.yaml: intro`) under the quote.
- **Research page:** a description of research interests, Google Scholar figures (publications, citations, h-index, citations per year) and one list of all academic publications. Op-eds go under Blog & Media. The Scholar figures live in `data/scholar.yaml` and are updated by hand: Scholar has no API and must not be scraped automatically.
- **About page:** biography plus the CV, rendered from `data/` in a scrolling frame, with links to the PDF CV (`profile.yaml: cv_pdf`, shown only once the file exists in `public/`), Google Scholar and ResearchGate.
- **Publications** are shown as APA references. Under each: Abstract (expands), PDF (when `pdf` is set), and “Cite” (a RIS file at `/research/ris/<id>.ris`). The Research page has two groups: Books (including `stage: under contract`) and Peer-reviewed articles and chapters (types article, chapter, commentary). Book reviews appear only in the CV.
- **Press kit:** `/rasmus-rosenberg-larsen-press-kit.zip`, generated on every build from `profile.yaml` (three bios) and `assets/press/` (high-resolution photos and book cover), linked at the top of Blog & Media.
- **Book retailers** are the book's `links` in `publications.yaml`: the first is the main "Order from" button, the rest go in a "More retailers" menu (`src/components/BuyLinks.astro`).
- **SEO:** sitemap (`@astrojs/sitemap`, `sitemap-index.xml`), `public/robots.txt`, canonical URLs, Open Graph and Twitter tags, schema.org JSON-LD. Possible next step: one page per publication with Google Scholar `citation_*` meta tags.
- **Contact:** a separate Contact page (email, enquiry note, office address, profiles). The footer is one slim line: email, profile links, copyright.
- **Dark mode** follows the visitor's device setting automatically; there is no toggle.
- **Home band rotation:** quotes (`site.yaml: quotes`) and promotions, shown after the first quote. A promotion is any record marked `featured: true` (media now; upcoming talks until their date), normalised in `src/lib/promotions.ts` and always drawn by the one template `src/components/Promo.astro` (16:9 image frame or tile, title, a standard description sentence per record type such as "Dr. Larsen was a guest on …, <date>.", one action link). Quotes stay unboxed: no panels or translucent backgrounds in the band. They rotate every 9 seconds (not with reduced motion) and can be picked with dots; picking one stops the rotation.
- **Teaching page:** University courses as `Title (CODE)` with the description in an opener, grouped as Science courses (FSC) then Philosophy courses (PHL), each in order of course code with graduate courses first; graduate courses carry a small label. Then Continuing education (`level: continuing-education`, with a `date`) and Educational resources (`tools.yaml`). Courses with the same content under different titles are merged into one entry; internships are kept as drafts (in the data, not on the site).
- **Footer link order:** LinkedIn, Google Scholar, ResearchGate, YouTube (`profile.yaml: show_links`).
- **Blog & Media page:** Media, then Op-eds and commentary, then Blog. Each list shows four items with "Show more". Items show thumbnail, title, outlet and a short summary, not APA. Thumbnails are stored in `public/images/media/`; items without one get a turquoise tile with the outlet name.
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
- **Build order:** (1) complete the data from the CV; (2) Typst PDF CV; (3) app v1: browse, add, edit, delete, live PDF preview, save; (4) quick add by DOI/ISBN/address; (5) suggestions inbox; (6) Publish button.
