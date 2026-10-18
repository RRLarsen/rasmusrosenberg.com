// The PDF CV. Content comes from the shared CV model (src/lib/cv.ts), exported by the site
// build as /cv.json and passed in by scripts/cv/build-pdf.mjs:
//   --input data=<cv.json>   --input names=<student names, or {} for the public version>

#let data = json(sys.inputs.at("data"))
#let names = json(sys.inputs.at("names"))

#let deep = rgb("#0f3b39")
#let muted = rgb("#5c6c69")
#let rule = rgb("#d3d6d1")
#let serif = "Newsreader 16pt"
#let sans = "Hanken Grotesk"

#set document(title: data.name + ": Curriculum vitae", author: data.name)
#set page(
  paper: "us-letter",
  margin: (x: 2.3cm, top: 2.1cm, bottom: 2.3cm),
  footer: context {
    set text(font: sans, size: 7.5pt, fill: muted)
    [#data.name, curriculum vitae #h(1fr) Updated #data.updated #h(1.5em) Page #counter(page).display("1 of 1", both: true)]
  },
)
#set text(font: serif, size: 10.5pt, lang: "en", hyphenate: false)
#set par(leading: 0.58em, spacing: 0.9em)
#show link: set text(fill: deep)

// Render styled runs; a "slot" is filled with a student's name only in the private version.
#let runs(rs) = {
  for r in rs {
    let slot = r.at("slot", default: none)
    if slot != none {
      let n = names.at(slot.split(":").at(1), default: none)
      if n != none [: #n]
    } else {
      let c = [#r.t]
      if r.at("href", default: none) != none { c = link(r.href, c) }
      if r.at("i", default: false) { c = emph(c) }
      if r.at("b", default: false) { c = strong(c) }
      c
    }
  }
}

#let when(s) = text(font: sans, size: 8pt, fill: muted, s)

// ---- header
#block(below: 1em)[
  #text(size: 23pt, weight: 300, tracking: -0.01em)[#data.name]
  #v(0.15em)
  #set text(font: sans, size: 8.5pt, fill: muted)
  #set par(leading: 0.5em)
  #for l in data.headline [#l \ ]
  #runs(data.contact)
]
#line(length: 100%, stroke: 0.6pt + rule)

// ---- sections
#for b in data.blocks {
  let entries = b.at("entries", default: none)
  let kind = b.at("kind", default: none)
  if b.title != "" {
    if b.level == 1 {
      block(above: 1.5em, below: 0.7em, sticky: true, text(size: 13.5pt, weight: 500, fill: deep, b.title))
    } else if b.level == 2 {
      block(above: 1.1em, below: 0.55em, sticky: true, text(font: sans, size: 7.8pt, weight: 600, tracking: 0.06em, fill: muted, upper(b.title)))
    } else {
      block(above: 0.85em, below: 0.45em, sticky: true, emph(b.title))
    }
  }
  if kind == "dated" or kind == "facts" {
    grid(
      columns: (2.8cm, 1fr), column-gutter: 0.35cm, row-gutter: 0.5em,
      ..entries.map(e => (when(e.at("when", default: "")), runs(e.runs))).flatten(),
    )
  } else if kind == "refs" or kind == "list" {
    for e in entries {
      block(above: 0pt, below: 0.55em, par(hanging-indent: 1.3em, runs(e.runs)))
    }
  } else if kind == "text" {
    for e in entries { block(above: 0pt, below: 0.45em, runs(e.runs)) }
  }
}
