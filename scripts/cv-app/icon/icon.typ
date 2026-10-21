// The dashboard's app icon: the website's wordmark style (turquoise, off-white serif capitals,
// two hairline rules with a gap). Build: typst compile scripts/cv-app/icon/icon.typ
//   scripts/cv-app/icon/icon.png --font-path cv/fonts --ignore-system-fonts --ppi 144
#set page(width: 512pt, height: 512pt, margin: 0pt, fill: none)
#let deep = rgb("#0f3b39")
#let paper = rgb("#ecebe5")
#let rule = line(length: 100%, stroke: 2.6pt + paper.transparentize(45%))
// macOS icon grid: an 824/1024 rounded square, centred
#place(center + horizon, rect(width: 412pt, height: 412pt, radius: 92pt, fill: deep))
#place(center + horizon, block(width: 300pt, {
  set text(fill: paper)
  set align(center)
  stack(dir: ttb, spacing: 0pt,
    text(font: "Newsreader 16pt", size: 132pt, weight: 400, tracking: 0.04em, top-edge: "cap-height", bottom-edge: "baseline")[RRL],
    v(26pt),
    grid(columns: (38%, 1fr, 38%), rule, [], rule),
    v(34pt),
    text(font: "Hanken Grotesk", size: 25pt, weight: 500, tracking: 0.22em, top-edge: "cap-height", bottom-edge: "baseline")[DASHBOARD],
  )
}))
