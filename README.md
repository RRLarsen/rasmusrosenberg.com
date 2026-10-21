# rasmusrosenberg.com

Personal academic website of Rasmus Rosenberg Larsen. Built with [Astro](https://astro.build); all content lives in YAML files in `data/`.

## Run it locally

```bash
npm install      # once
npm run dev      # preview at http://localhost:4321 (updates as you edit)
npm run build    # build the site into dist/ and the PDF CVs (public/ and private/)
npm run dashboard  # open the dashboard at http://localhost:4400: CV builder, website content,
                   # suggestions inbox, local website preview, checkpoint and publish
```

## Where things are

- `data/`: all content (profile, publications, talks, teaching, expertise …). Edit these, not the pages.
- `src/content.config.ts`: the rules each data file must follow. A broken file stops the build with a message naming the file and field.
- `src/styles/tokens.css`: colours, fonts and spacing for the current design.
- `src/pages/`: one file per page; `src/components/` and `src/layouts/`: shared building blocks.
- `design/`: design mockups from the planning stage, kept for reference.

See `CLAUDE.md` for the full project brief and decisions.

## Licence

The code is under the MIT License; the content (texts, CV data, photographs, images) is not, and all rights are reserved. See `LICENSE`.
