// Thumbnail (640 × 360) for the Canadian case-law study, used when it is promoted on the
// home page. Build: typst compile scripts/images/canadian-case-law.typ out.png --root .
//   --font-path cv/fonts --ignore-system-fonts --ppi 144, then save as JPEG in public/images/media/.
#set page(width: 320pt, height: 180pt, margin: 0pt, fill: rgb("#164a47"))
#let paper = rgb("#ecebe5")
#let soft = rgb("#b9cbc7")
#place(left + horizon, dx: 24pt, dy: -6pt, block(width: 276pt, {
  set text(fill: paper)
  set par(leading: 0.42em, spacing: 0pt)
  stack(dir: ttb, spacing: 0pt,
    text(font: "Hanken Grotesk", size: 8pt, weight: 600, tracking: 0.12em, fill: soft)[CANADIAN COURTS, 1980–2023],
    v(12pt),
    text(font: "Newsreader 16pt", size: 54pt, weight: 300, top-edge: "cap-height", bottom-edge: "baseline")[3,315],
    v(12pt),
    text(font: "Newsreader 16pt", size: 15pt, weight: 300)[court cases reviewed for the use of psychopathy assessments],
  )
}))
#place(left + bottom, dx: 24pt, dy: -14pt, text(font: "Hanken Grotesk", size: 7.5pt, fill: soft, style: "italic")[Psychology, Public Policy, and Law, 2026])
