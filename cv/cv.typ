// The PDF CV. Content comes from the shared CV model (src/lib/cv.ts), exported by the site
// build as /cv.json and passed in by scripts/cv/build-pdf.mjs:
//   --input data=<cv.json>   --input names=<student names, or {} for the public version>

#let data = json(sys.inputs.at("data"))
#let names = json(sys.inputs.at("names"))

#let deep = rgb("#0f3b39")
#let muted = rgb("#5c6c69")
#let rule = rgb("#d3d6d1")
// one typeface throughout, for a simple, consistent page
#let sans = "Hanken Grotesk"

#set document(title: data.name + ": Curriculum vitae", author: data.name)
#set page(
  paper: "us-letter",
  margin: (x: 2.3cm, top: 2.4cm, bottom: 2.2cm),
  header: context {
    set text(font: sans, size: 7.5pt, fill: muted)
    if counter(page).get().first() == 1 {
      // the first page carries the title instead, so only the date here
      align(right)[Updated #data.updated]
    } else {
      block(width: 100%, stroke: (bottom: 0.4pt + rule), inset: (bottom: 0.45em),
        [#data.name #h(1fr) Curriculum vitae #h(0.6em) · #h(0.6em) Updated #data.updated])
    }
  },
  footer: context {
    set text(font: sans, size: 7.5pt, fill: muted)
    align(center, counter(page).display("1 of 1", both: true))
  },
)
#set text(font: sans, size: 10pt, lang: "en", hyphenate: false)
#set par(leading: 0.62em, spacing: 0.9em)
#show link: set text(fill: deep)

// Let written-out web addresses break after / - _ ? & = (never inside "//") so they wrap instead of overflowing.
#let breakable(s) = s.replace(regex("(/+|[?&=_-])"), m => m.text + sym.zws)

// Render styled runs; a "slot" is filled with a student's name only in the private version.
#let runs(rs) = {
  for r in rs {
    let slot = r.at("slot", default: none)
    if slot != none {
      let n = names.at(slot.split(":").at(1), default: none)
      if n != none [: #n]
    } else {
      let href = r.at("href", default: none)
      let c = if href != none and r.t == href { [#breakable(r.t)] } else { [#r.t] }
      if href != none { c = link(href, c) }
      if r.at("i", default: false) { c = emph(c) }
      if r.at("b", default: false) { c = strong(c) }
      c
    }
  }
}

#let when(s) = text(font: sans, size: 7.6pt, fill: muted, s)
// space between entries; the line spacing inside an entry is 0.62em, so this leaves a clear gap
#let gap = 1.15em

// One entry never splits across a page; a heading always stays with the entry below it.
#let entry(body, last) = block(breakable: false, above: 0pt, below: if last { 0pt } else { gap }, width: 100%, body)
#let row(left, right, l: 2.8cm, g: 0.35cm) = grid(columns: (l, 1fr), column-gutter: g, left, right)

// ---- title
#align(center, block(below: 2em, text(size: 20pt, weight: 600, fill: deep)[Curriculum Vitae: #data.title_name]))

// ---- sections
#for (n, b) in data.blocks.enumerate() {
  let entries = b.at("entries", default: ())
  let kind = b.at("kind", default: none)
  if b.title != "" {
    if b.level == 1 {
      block(above: if n == 0 { 0pt } else { 2.2em }, below: 1em, sticky: true, width: 100%,
        stroke: (bottom: 1.2pt + deep), inset: (bottom: 0.35em),
        text(size: 14.5pt, weight: 600, fill: deep, b.title))
    } else if b.level == 2 {
      block(above: 1.6em, below: 0.75em, sticky: true, text(size: 10.5pt, weight: 600, fill: deep, b.title))
    } else {
      block(above: 1.2em, below: 0.6em, sticky: true, text(size: 9.5pt, weight: 700, fill: deep, b.title))
    }
  }
  let last = entries.len() - 1
  let items = if kind == "facts" {
    // short label/value pairs, kept together with normal line spacing
    (block(breakable: false, grid(columns: (2.8cm, 1fr), column-gutter: 0.35cm, row-gutter: 0.62em,
      ..entries.map(e => (when(e.at("when", default: "")), runs(e.runs))).flatten())),)
  } else if kind == "dated" {
    entries.enumerate().map(((i, e)) => entry(row(when(e.at("when", default: "")), runs(e.runs)), i == last))
  } else if (kind == "refs" or kind == "list") and b.at("numbered", default: false) {
    entries.enumerate().map(((i, e)) => entry(row(align(right, text(fill: muted, size: 9pt)[#e.num.]), runs(e.runs), l: 1.6em, g: 0.6em), i == last))
  } else if kind == "refs" or kind == "list" {
    entries.enumerate().map(((i, e)) => entry(par(hanging-indent: 1.3em, runs(e.runs)), i == last))
  } else if kind == "text" {
    entries.enumerate().map(((i, e)) => entry(runs(e.runs), i == last))
  } else { () }
  // short sections (up to five entries) move to the next page as a whole rather than split
  if entries.len() <= 5 and kind != none { block(breakable: false, above: 0pt, below: 0pt, items.join()) } else { items.join() }
}
