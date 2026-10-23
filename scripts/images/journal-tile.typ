// A 640 × 360 tile for a journal: its cover on the left, its name on the right, on the
// site's turquoise. Used as the default picture when a publication in that journal is
// promoted on the home page. Build, from the project folder:
//   typst compile scripts/images/journal-tile.typ tile.png --root . --font-path cv/fonts
//     --ignore-system-fonts --ppi 144 --input cover=/path/in/project.jpg --input name="Journal name"
// then save it as a JPEG in public/images/media/ and set it as the journal's image.
#set page(width: 320pt, height: 180pt, margin: 0pt, fill: rgb("#164a47"))
#let paper = rgb("#ecebe5")
#let soft = rgb("#b9cbc7")
#place(left + horizon, dx: 22pt, box(stroke: 0.5pt + black.transparentize(70%), image(sys.inputs.at("cover"), height: 128pt)))
#place(left + horizon, dx: 140pt, block(width: 160pt, {
  set par(leading: 0.4em)
  text(font: "Hanken Grotesk", size: 7pt, weight: 600, tracking: 0.14em, fill: soft)[JOURNAL]
  v(6pt)
  text(font: "Newsreader 16pt", size: 19pt, weight: 300, fill: paper, style: "italic")[#sys.inputs.at("name")]
}))
