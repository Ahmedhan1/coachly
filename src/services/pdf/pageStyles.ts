import {
  BLOCK_GAP_PX,
  CHART_HEIGHT_PX,
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_PX,
  EXERCISE_IMAGE_PX,
  FONT,
  FOOTER_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  PAGE_HEIGHT_PX,
  PAGE_MARGIN_BOTTOM_PX,
  PAGE_MARGIN_TOP_PX,
  PAGE_MARGIN_X_PX,
  PAGE_WIDTH_PX,
  PHOTO_PAIR_HEIGHT_PX,
  RECIPE_IMAGE_PX,
  SUPPLEMENT_IMAGE_PX,
} from '@/domain/pdf';

/**
 * Stylesheet for PDF pages and for the off-screen measuring box. Sizes come from src/domain/pdf/layout so
 * estimates, measurement and rendering agree. Logical properties only (RTL).
 */
export function pdfStyles(): string {
  return `
.ptpdf-page, .ptpdf-measure { box-sizing: border-box; color: #1c1c1e; font-size: ${FONT.body}px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-kerning: normal; }
.ptpdf-page *, .ptpdf-measure * { box-sizing: border-box; margin: 0; padding: 0; }
.ptpdf-page { position: relative; width: ${PAGE_WIDTH_PX}px; height: ${PAGE_HEIGHT_PX}px; overflow: hidden; background: #fff; }
.ptpdf-measure { position: absolute; inset-block-start: 0; inset-inline-start: 0; width: ${CONTENT_WIDTH_PX}px; }
.ptpdf-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ptpdf-hdr { position: absolute; inset-block-start: ${PAGE_MARGIN_TOP_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px; height: ${HEADER_HEIGHT_PX}px;
  display: flex; align-items: center; gap: 12px; border-block-end: 2px solid var(--c1); padding-block-end: 8px; }
.ptpdf-hdr img { height: var(--hlogo); width: auto; max-width: 160px; object-fit: contain; }
.ptpdf-hdr .who { font-weight: 700; color: var(--c1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
.ptpdf-hdr .doc { margin-inline-start: auto; color: var(--c2); font-size: ${FONT.small}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
.ptpdf-content { position: absolute; inset-block-start: ${PAGE_MARGIN_TOP_PX + HEADER_HEIGHT_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px;
  height: ${CONTENT_HEIGHT_PX}px; overflow: hidden; padding-block-start: 4px; }
.ptpdf-ftr { position: absolute; inset-block-end: ${PAGE_MARGIN_BOTTOM_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px; height: ${FOOTER_HEIGHT_PX}px;
  border-block-start: 1px solid #d1d1d6; padding-block-start: 8px; font-size: 11px; line-height: 1.5; color: #48484a;
  display: flex; flex-direction: column; justify-content: flex-start; gap: 4px; }
.ptpdf-ftr .disc { font-weight: 600; color: #3a3a3c; }
.ptpdf-ftr .row { display: flex; gap: 12px; align-items: baseline; }
.ptpdf-ftr .row .contact { margin-inline-start: auto; }
.ptpdf-ftr .num { font-weight: 700; color: var(--c1); }
.ptpdf-onbg .ptpdf-ftr, .ptpdf-onbg .ptpdf-hdr { background: rgba(255,255,255,.88); border-radius: 10px; padding-inline: 10px; }

.blk { margin-block-end: ${BLOCK_GAP_PX}px; break-inside: avoid; }
.card { background: rgba(255,255,255,.93); border: 1px solid #e5e5ea; border-radius: 12px; padding: 12px 14px; }
.b-section { font-size: ${FONT.title}px; font-weight: 700; line-height: 1.4; color: var(--c1);
  border-inline-start: 5px solid var(--c1); padding-inline-start: 10px; padding-block: 2px 4px; background: rgba(255,255,255,.9); border-radius: 4px; }
.b-sub { font-size: ${FONT.sub}px; font-weight: 700; line-height: 1.5; display: flex; gap: 10px; align-items: baseline;
  background: rgba(255,255,255,.9); border-radius: 6px; padding-block: 1px 2px; padding-inline: 4px; }
.b-sub .meta { margin-inline-start: auto; color: var(--c2); font-size: ${FONT.small}px; font-weight: 500; }
.b-kv { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; row-gap: 6px; }
.b-kv .kv { display: flex; gap: 8px; align-items: baseline; padding-block: 3px; border-block-end: 1px dashed #e5e5ea; min-width: 0; }
.b-kv .k { color: #6e6e73; white-space: nowrap; }
.b-kv .v { font-weight: 600; overflow-wrap: anywhere; }
.b-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.b-stats .st { border-radius: 12px; padding: 10px 12px; background: rgba(255,255,255,.93); border: 1px solid #e5e5ea; height: 84px; }
.b-stats .st.em { background: var(--c1); color: #fff; border-color: var(--c1); }
.b-stats .lbl { font-size: ${FONT.small}px; opacity: .85; }
.b-stats .val { font-size: 26px; font-weight: 700; line-height: 1.3; }
.b-stats .unit { font-size: ${FONT.small}px; margin-inline-start: 4px; font-weight: 500; }
.b-bar .bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; }
.b-bar .bar span { display: block; height: 100%; }
.b-bar .legend { display: flex; gap: 18px; font-size: ${FONT.small}px; margin-block-start: 6px; }
.b-bar i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-inline-end: 6px; vertical-align: middle; }
.tone-protein { background: var(--c1); } .tone-carbs { background: #e0a526; } .tone-fat { background: #8e8e93; }
.b-p { background: rgba(255,255,255,.9); border-radius: 6px; padding-inline: 4px; overflow-wrap: anywhere; white-space: pre-line; }
.b-p.muted { color: #48484a; font-size: ${FONT.small + 1}px; }
.b-ex { display: flex; gap: 12px; align-items: flex-start; }
.b-ex .n { flex: none; width: 28px; height: 28px; border-radius: 14px; background: var(--c1); color: #fff; font-weight: 700;
  display: flex; align-items: center; justify-content: center; font-size: 13px; }
.b-ex .t { flex: 1; min-width: 0; }
.b-ex .nm { font-size: ${FONT.name}px; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.b-ex .en, .b-ex .mus, .b-ex .note { font-size: ${FONT.small}px; color: #6e6e73; line-height: 1.6; overflow-wrap: anywhere; }
.b-ex .rx { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-block-start: 4px; }
.b-ex .rx b { color: var(--c1); margin-inline-end: 3px; }
.b-ex .ss { display: inline-block; font-size: 11px; color: #fff; background: var(--c2); border-radius: 6px; padding: 0 6px; margin-inline-start: 6px; vertical-align: middle; }
.pic { flex: none; width: ${EXERCISE_IMAGE_PX}px; height: ${EXERCISE_IMAGE_PX}px; border-radius: 10px; background: #f2f2f7; object-fit: cover; display: block; }
.pic.map { object-fit: contain; background: #fafafa; }
.b-meal { display: flex; gap: 8px; align-items: baseline; padding-inline: 12px; background: rgba(255,255,255,.9); border-radius: 6px; }
.b-meal::before { content: ''; width: 6px; height: 6px; border-radius: 3px; background: var(--c1); flex: none; transform: translateY(-2px); }
.b-meal .d { margin-inline-start: auto; color: #6e6e73; font-size: ${FONT.small}px; white-space: nowrap; }
.b-rec .top { display: flex; gap: 16px; align-items: flex-start; }
.b-rec .t { flex: 1; min-width: 0; }
.b-rec .pic { width: ${RECIPE_IMAGE_PX}px; height: ${RECIPE_IMAGE_PX}px; }
.b-rec .nm, .b-sup .nm { font-size: ${FONT.name}px; font-weight: 700; overflow-wrap: anywhere; }
.b-rec .d, .b-rec li, .b-rec .ins { font-size: ${FONT.small}px; color: #48484a; }
.b-rec ul { list-style: none; } .b-rec li::before { content: '• '; color: var(--c1); }
.b-rec .ins { margin-block-start: 8px; white-space: pre-line; overflow-wrap: anywhere; }
.b-sup { display: flex; gap: 16px; align-items: flex-start; }
.b-sup .pic { width: ${SUPPLEMENT_IMAGE_PX}px; height: ${SUPPLEMENT_IMAGE_PX}px; object-fit: contain; background: #fff; }
.b-sup .t { flex: 1; min-width: 0; } .b-sup .r { overflow-wrap: anywhere; } .b-sup .r b { color: #6e6e73; font-weight: 500; margin-inline-end: 6px; }
.b-sup .note { font-size: ${FONT.small}px; color: #6e6e73; }
.b-chart .ttl { font-weight: 700; margin-block-end: 4px; }
.b-chart svg { display: block; width: 100%; height: ${CHART_HEIGHT_PX}px; }
.b-photos { display: flex; gap: 16px; }
.b-photos figure { flex: 1; height: ${PHOTO_PAIR_HEIGHT_PX}px; display: flex; flex-direction: column; gap: 6px; }
.b-photos img, .b-photos .ph { flex: 1; min-height: 0; width: 100%; object-fit: cover; border-radius: 12px; background: #f2f2f7; }
.b-photos figcaption { text-align: center; font-weight: 600; }
.b-contact .ttl { font-weight: 700; font-size: ${FONT.sub}px; color: var(--c1); margin-block-end: 4px; }
.b-contact div { overflow-wrap: anywhere; }

.ptpdf-cover .cimg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ptpdf-cover .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,.15) 0%, rgba(255,255,255,.92) 55%, #fff 75%); }
.ptpdf-cover .plain { position: absolute; inset-block-start: 0; inset-inline: 0; height: 46%; background: var(--c1); opacity: .1; }
.ptpdf-cover .inner { position: absolute; inset-block-start: 72px; inset-inline: 64px; inset-block-end: ${FOOTER_HEIGHT_PX + PAGE_MARGIN_BOTTOM_PX + 24}px;
  display: flex; flex-direction: column; gap: 18px; }
.ptpdf-cover .logo { display: flex; } .ptpdf-cover .logo img { height: var(--clogo); width: auto; max-width: 100%; object-fit: contain; }
.ptpdf-cover .logo.start { justify-content: flex-start; } .ptpdf-cover .logo.center { justify-content: center; } .ptpdf-cover .logo.end { justify-content: flex-end; }
.ptpdf-cover .spacer { flex: 1; }
.ptpdf-cover h1 { font-size: 40px; line-height: 1.35; font-weight: 800; color: var(--c1); overflow-wrap: anywhere; }
.ptpdf-cover .sub { font-size: 20px; color: var(--c2); font-weight: 500; overflow-wrap: anywhere; }
.ptpdf-cover dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 18px; margin-block-start: 12px;
  background: rgba(255,255,255,.9); border-radius: 14px; padding: 16px 20px; border: 1px solid #e5e5ea; }
.ptpdf-cover dt { color: #6e6e73; } .ptpdf-cover dd { font-weight: 700; overflow-wrap: anywhere; }
`;
}
