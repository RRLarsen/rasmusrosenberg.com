// The horizontal book image for the home page on phones: the cover on the left, an
// endorsement on the right, on the site's turquoise. Build (from the project folder):
//   typst compile scripts/images/book-banner.typ book-banner.png --root . --font-path cv/fonts
//     --ignore-system-fonts --ppi 144
// then save it as public/images/psychopathy-unmasked-wide.jpg (e.g. with sips -s format jpeg).
#set page(width: 720pt, height: 450pt, margin: 0pt, fill: rgb("#0f3b39"))
#let paper = rgb("#ecebe5")
#let soft = rgb("#b9cbc7")

#place(left + horizon, dx: 44pt, {
  // a soft shadow: a few offset, faint rectangles behind the cover
  for (i, a) in ((10, 88%), (6, 82%), (3, 76%)).enumerate() {
    place(dx: a.at(0) * 1pt, dy: a.at(0) * 1pt, rect(width: 262pt, height: 393pt, radius: 2pt, fill: black.transparentize(a.at(1))))
  }
  box(image("/assets/press/psychopathy-unmasked-cover.jpg", width: 262pt, height: 393pt, fit: "cover"))
})

#place(left + horizon, dx: 348pt, block(width: 340pt, {
  set text(fill: paper)
  set par(leading: 0.5em)
  text(font: "Newsreader 16pt", size: 33pt, weight: 300)[“There are countless books on psychopathy, but #emph[Psychopathy Unmasked] is the first scholarly book to provide a critical analysis of psychopathy.”]
  v(20pt)
  line(length: 38pt, stroke: 1.2pt + soft)
  v(12pt)
  set text(font: "Hanken Grotesk", size: 18pt, fill: soft)
  set par(leading: 0.45em)
  text(weight: 600, fill: paper)[Dr. David DeMatteo] + linebreak() + [Drexel University]
}))
