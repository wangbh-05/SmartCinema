---
name: thubeamer
description: Create, revise, and compile Tsinghua University-styled Beamer presentations with the repository's THUBeamer template. Use for SmartCinema course-defense slides, editing `thubeamer/main.tex` or `main-en.tex`, adding figures/citations, and producing the final PDF.
---

# THUBeamer

Use the repository-local template at `thubeamer/`; it is the source of truth for
the presentation and produces a PDF, not a PowerPoint `.pptx` file.

## Create or revise slides

1. Inspect `thubeamer/main.tex` before editing. Keep its document preamble and
   `\usetheme{thubeamer}` unless the requested visual layout requires a template
   option.
2. Write Chinese slides in `main.tex`. For an English-only deck, start from
   `main-en.tex` and use `\usetheme[en]{thubeamer}`; the `en` option deliberately
   disables Chinese typesetting.
3. Put page-level content in `\begin{frame}{标题} ... \end{frame}`. Use
   `\section` and `\subsection` for the navigation hierarchy; retain the initial
   title and table-of-contents frames unless asked to remove them.
4. Put copied images in `thubeamer/figures/` and reference them without a path
   when `\graphicspath{{figures/}}` remains enabled. Prefer vector PDF or
   high-resolution PNG/JPEG. Never overwrite `figures/thulogo.pdf`.
5. Add bibliography entries to `thubeamer/reference.bib` and cite with
   `\cite{key}`. Leave `\bibliographystyle{thubeamer}` and
   `\bibliography{reference}` in place when references are required.

## Select theme options

Pass options in the theme declaration, for example:

```tex
\usetheme[sidebar,sectiontoc,subsectiontoc]{thubeamer}
```

Available options:

- `smoothbars` — default, top navigation and two-line footer.
- `sidebar` — left navigation; uses the Tsinghua logo.
- `sectiontoc` — insert a highlighted outline before each section.
- `subsectiontoc` — insert a highlighted outline before each subsection.
- `en` — English-only typesetting.
- `thupurple` or `thupurple2` — accepted palette options; the bundled version
  renders both with the same purple color settings.

Do not add `sectiontoc`/`subsectiontoc` merely for decoration: each option creates
additional frames and changes the final slide count.

## Build and validate

1. Ensure a full TeX installation provides `pdflatex`, `xelatex`, `bibtex`,
   `makeindex`, and GNU `make`. On macOS, MacTeX is the usual distribution;
   TeX Live is suitable on Linux.
2. From the repository root, run the bootstrap once after a fresh clone or after
   `make cleanall`:

   ```bash
   make -C thubeamer doc
   ```

   This extracts the theme `.sty` files from `thubeamer.dtx`; it requires
   XeLaTeX and must precede Beamer compilation.
3. Build the Chinese presentation:

   ```bash
   make -C thubeamer beamer
   ```

   For the English deck, run `make -C thubeamer beamer-en`. The Makefile runs
   PDFLaTeX, BibTeX, and two further PDFLaTeX passes so citations, navigation,
   and total page numbers stabilize.
4. Inspect the generated `thubeamer/main.pdf` (or `main-en.pdf`) before delivery.
   Check for overfull text, missing glyphs, missing images, unresolved citations,
   incorrect title metadata, and a sensible final page count.
5. Use `make -C thubeamer clean` only to remove generated auxiliary files.
   Do not use `cleanall` unless regeneration of the theme styles is intentional.

## Working conventions

- Keep the supplied `thubeamer.dtx`, `thubeamer.bst`, `License`, and logo intact.
- Keep individual frames concise: a single point per slide, readable font sizes,
  and no dense paragraphs. Split overloaded tables or lists across frames.
- Use `block`, `alertblock`, `exampleblock`, `itemize`, `enumerate`, `table`, and
  `figure` from standard Beamer before adding custom formatting.
- Preserve the existing source comments that mark content requiring factual
  verification; replace TODOs only with project-confirmed information.
- Source details: `thubeamer/README.md`, `thubeamer/Makefile`,
  `thubeamer/thubeamer.dtx`, and the working example `thubeamer/main.tex`.
