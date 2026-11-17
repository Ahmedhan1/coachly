---
name: pdf-template-qa
description: Use after ANY change to PDF generation — templates, sections, cover, background, logo, fonts, page size, image handling, or the html-to-image / jsPDF pipeline (src/services/pdf, src/domain PDF model, src/features PDF builder). Generates the five spec test PDFs, rasterises them, and reviews direction, page breaks, background and images before the change is called done.
---

# PDF template QA

PDFs are built on the phone: each A4 page is rendered as Arabic RTL HTML, converted to a high-resolution image
(html-to-image) and assembled with jsPDF, then shared to WhatsApp. Text inside the PDF is an image, so problems
are only visible by **looking at the pages**. Do not call a PDF change done from code review alone.

## 1. Generate the five test PDFs (from docs/SPEC.md QA section)

Use the PDF test fixtures (Playwright, mobile viewport) and write the outputs to a scratch folder, never the
repo:

1. **Client without any images** — no logo, no exercise images, no progress photos.
2. **Program with 50 exercises** — each with its image and muscle-map snapshot (memory + page-break stress).
3. **Very long names** — very long client name, program name and exercise names (wrapping, overflow).
4. **Mixed Arabic + English text** — e.g. "بنش برس 3×10 @ RPE 8", English notes inside Arabic paragraphs.
5. **Background and logo at maximum size** — largest allowed logo, full-page background at the strongest
   opacity, separate cover.

If a fixture does not exist yet, create it first; the five cases are mandatory.

## 2. Rasterise

Convert every page of every PDF to PNG (e.g. `pdftoppm -r 110 -png file.pdf out/page` if poppler is available,
or render with pdf.js in Playwright). Open the PNGs and look at every page yourself.

## 3. Review checklist (every page)

- [ ] **Direction:** text right-aligned, RTL order correct, numbers and Latin words not reversed, bullets and
      tables mirrored correctly; digits are 0-9.
- [ ] **Arabic shaping:** letters joined, no missing glyphs (tofu boxes), the chosen font is actually used.
- [ ] **Page breaks:** no exercise row, table row, image or heading cut between pages; no empty pages; headings
      not orphaned at the bottom of a page.
- [ ] **Background:** present on every page with the configured opacity; cover uses its own background;
      text stays readable over it.
- [ ] **Logo:** correct position and size; not stretched; maximum size does not overlap content.
- [ ] **Images:** every exercise image and muscle-map/3D snapshot present, not blurry, not distorted; images
      were downscaled (~1200 px longest side) before embedding.
- [ ] **Content:** only the sections the trainer selected, in the chosen order; fixed disclaimer line present
      (editable text); footer and contact details present; no supplement dose the trainer did not enter.
- [ ] **Overflow:** long names wrap or truncate cleanly, nothing runs off the page.
- [ ] **Size:** report file size of each PDF; the 50-exercise PDF must stay shareable on WhatsApp — record the
      number and flag anything that grew a lot versus the previous run.
- [ ] **Memory:** the 50-exercise PDF is built page by page without crashing the test browser.
- [ ] **Forbidden words:** `npm run check:words` passes.

## 4. Report

Show: the command(s) run, the five file sizes and page counts, a few representative page PNGs (cover, a
50-exercise page break, the mixed-text page, the max-logo page), and every checklist item that failed. Items that
only a real iPhone can confirm (WhatsApp opening, Android viewer, memory on an old iPhone) go to
`docs/MANUAL_QA.md`, not "passed".
