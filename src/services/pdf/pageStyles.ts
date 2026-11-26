import {
  BLOCK_GAP_PX,
  CHART_HEIGHT_PX,
  CLIENT_PHOTO_PX,
  CLOSING_LOGO_PX,
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_PX,
  EXERCISE_IMAGE_PX,
  FONT,
  FOOTER_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  MUSCLE_MAP_PX,
  PAGE_HEIGHT_PX,
  PAGE_MARGIN_BOTTOM_PX,
  PAGE_MARGIN_TOP_PX,
  PAGE_MARGIN_X_PX,
  PAGE_WIDTH_PX,
  PHOTO_PAIR_HEIGHT_PX,
  RECIPE_IMAGE_PX,
  ROW_PAD_PX,
  TABLE_COLS,
  TABLE_HEAD_PX,
  SUPPLEMENT_IMAGE_PX,
} from '@/domain/pdf';

/**
 * Stylesheet for PDF pages and for the off-screen measuring box. Sizes come from src/domain/pdf/layout so
 * estimates, measurement and rendering agree. Logical properties only (RTL). Colors are page variables set
 * from the trainer's settings: --c1 primary, --on1 text on it, --ink1 primary as text, --tint1, --deep1.
 *
 * Look: Pebble (docs/DESIGN.md §5) on paper — warm off-white page, white rounded cards with a faint warm shadow,
 * pill chips, round number badges, light table headers. Only colours, corners, fills and shadows differ from
 * the layout model: every size the paginator relies on (src/domain/pdf/layout) is unchanged.
 */
export function pdfStyles(): string {
  return `
.ptpdf-page, .ptpdf-measure { box-sizing: border-box; color: #1c1a17; font-size: ${FONT.body}px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-kerning: normal; }
.ptpdf-page *, .ptpdf-measure * { box-sizing: border-box; margin: 0; padding: 0; }
.ptpdf-page { position: relative; width: ${PAGE_WIDTH_PX}px; height: ${PAGE_HEIGHT_PX}px; overflow: hidden; background: #f6f4f0; }
.ptpdf-measure { position: absolute; inset-block-start: 0; inset-inline-start: 0; width: ${CONTENT_WIDTH_PX}px; }
.ptpdf-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ptpdf-strip { display: none; }
.ptpdf-hdr { position: absolute; inset-block-start: ${PAGE_MARGIN_TOP_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px; height: ${HEADER_HEIGHT_PX - 14}px;
  display: flex; align-items: center; gap: 14px; padding-block-end: 8px; }
.ptpdf-hdr .lg { height: var(--hlogo); width: auto; max-width: 210px; object-fit: contain; flex: none; }
.ptpdf-hdr .id { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.35; }
.ptpdf-hdr .who { font-weight: 800; font-size: 16px; color: var(--ink1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ptpdf-hdr .doc { color: #6b665d; font-size: ${FONT.small}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ptpdf-content { position: absolute; inset-block-start: ${PAGE_MARGIN_TOP_PX + HEADER_HEIGHT_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px;
  height: ${CONTENT_HEIGHT_PX}px; overflow: hidden; }
.ptpdf-ftr { position: absolute; inset-block-end: ${PAGE_MARGIN_BOTTOM_PX}px; inset-inline: ${PAGE_MARGIN_X_PX}px; height: ${FOOTER_HEIGHT_PX}px;
  padding-block-start: 8px; font-size: 10.5px; line-height: 1.5; color: #6b665d;
  display: flex; gap: 16px; align-items: flex-start; }
.ptpdf-ftr .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ptpdf-ftr .disc { font-weight: 600; color: #57524a; }
.ptpdf-ftr .row { display: flex; gap: 12px; flex-wrap: wrap; }
.ptpdf-ftr .row .contact { color: #57524a; }
.ptpdf-ftr .num { flex: none; min-width: 58px; text-align: center; font-weight: 700; font-size: 12px; color: var(--on1); background: var(--c1);
  border-radius: 999px; padding: 3px 10px; }
.ptpdf-onbg .ptpdf-ftr, .ptpdf-onbg .ptpdf-hdr { background: rgba(255,255,255,.92); border-radius: 18px; padding-inline: 14px; }
/* Over a trainer background, titles and loose text sit on a white pill so they stay readable. */
.ptpdf-onbg .b-section { background: rgba(255,255,255,.92); border-radius: 999px; }
.ptpdf-onbg .b-p { background: rgba(255,255,255,.92); }

.blk { margin-block-end: ${BLOCK_GAP_PX}px; break-inside: avoid; }
.blk.b-exh, .blk.b-ex:not(.last) { margin-block-end: 0; }
.card { background: rgba(255,255,255,.97); border: 1px solid transparent; border-radius: 22px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(40,30,20,.05), 0 6px 18px rgba(40,30,20,.06); }
.b-section { display: flex; align-items: center; gap: 12px; background: transparent; color: #1c1a17; border-radius: 0;
  padding-block: 8px; padding-inline: 8px 16px; font-size: ${FONT.title}px; font-weight: 800; line-height: 1.4; margin-block-start: 4px; }
.b-section .no { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--c1); color: var(--on1); font-size: 14px;
  display: flex; align-items: center; justify-content: center; font-weight: 700; letter-spacing: .5px; margin-inline-start: 6px; }
.b-section .tx { overflow-wrap: anywhere; }
.b-sub { display: flex; gap: 10px; align-items: center; font-size: ${FONT.sub}px; font-weight: 800; line-height: 1.45; color: var(--ink1);
  background: var(--tint1); border-inline-start: 5px solid transparent; border-radius: 999px; padding-block: 6px; padding-inline: 14px 12px; }
.b-sub .tx { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.b-sub .meta { flex: none; color: #57524a; background: #fff; border-radius: 999px; padding: 1px 10px; font-size: ${FONT.small}px; font-weight: 600; }

.b-client { padding: 0; overflow: hidden; }
.b-client .hd { background: var(--tint1); padding: 14px 16px; border-block-end: 1px solid transparent; display: flex; align-items: center; gap: 16px; }
.b-client .who { flex: 1; min-width: 0; }
.b-client .av { flex: none; width: ${CLIENT_PHOTO_PX}px; height: ${CLIENT_PHOTO_PX}px; border-radius: 50%; object-fit: cover; background: #efece6; border: 3px solid #fff; }
.b-client .nm { font-size: 24px; font-weight: 800; line-height: 1.35; overflow-wrap: anywhere; }
.b-client .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: 8px; }
.b-client .chips span { background: #fff; border: 1px solid #fff; border-radius: 999px; padding: 2px 12px; font-size: 13px; font-weight: 600; }
.b-client .chips span:first-child { background: var(--c1); color: var(--on1); border-color: var(--c1); }
.b-client .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 14px 14px; }
.b-client .st { height: 70px; }

.b-kv { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; row-gap: 4px; }
.b-kv .kv { display: flex; gap: 8px; align-items: baseline; padding-block: 4px; border-block-end: 1px solid #efece6; min-width: 0; }
.b-kv .k { color: #6b665d; white-space: nowrap; }
.b-kv .v { font-weight: 700; overflow-wrap: anywhere; margin-inline-start: auto; }
.b-stats { display: grid; gap: 8px; }
.st { border-radius: 18px; padding: 8px 12px; background: #f6f4f0; border: 1px solid #f6f4f0; height: 82px; min-width: 0; }
.b-stats .st { background: #fff; border-color: #fff; box-shadow: 0 1px 2px rgba(40,30,20,.05), 0 6px 18px rgba(40,30,20,.06); }
.st.em { background: var(--c1); color: var(--on1); border-color: var(--c1); }
.st .lbl { font-size: ${FONT.small}px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st .val { font-size: 24px; font-weight: 800; line-height: 1.35; white-space: nowrap; }
.st .unit { font-size: ${FONT.small}px; margin-inline-start: 4px; font-weight: 500; }
.b-bar .bar { display: flex; height: 16px; border-radius: 999px; overflow: hidden; gap: 2px; }
.b-bar .bar span { display: block; height: 100%; }
.b-bar .legend { display: flex; gap: 22px; font-size: 13px; margin-block-start: 8px; }
.b-bar .legend b { font-weight: 800; }
.b-bar i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
.tone-protein { background: var(--c1); } .tone-carbs { background: #e0a526; } .tone-fat { background: #8f897f; }
.b-p { background: transparent; border-radius: 8px; padding-inline: 4px; overflow-wrap: anywhere; white-space: pre-line; }
.b-p.muted { color: #57524a; font-size: ${FONT.small + 1}px; }

.b-exh, .b-ex { display: block; }
.b-exh .row, .b-ex { display: grid; align-items: center;
  grid-template-columns: ${TABLE_COLS.index}px ${TABLE_COLS.image}px minmax(0, 1fr) ${TABLE_COLS.setsReps}px ${TABLE_COLS.rest}px ${TABLE_COLS.details}px; }
.b-exh.wm .row, .b-ex.wm { grid-template-columns: ${TABLE_COLS.index}px ${TABLE_COLS.image}px minmax(0, 1fr) ${TABLE_COLS.setsReps}px ${TABLE_COLS.rest}px ${TABLE_COLS.details}px ${TABLE_COLS.map}px; }
.b-exh .cont { height: 26px; font-size: ${FONT.small}px; font-weight: 700; color: var(--ink1); padding-inline: 4px; line-height: 22px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.b-exh .row { height: ${TABLE_HEAD_PX}px; background: #ebe7df; color: #57524a; border-radius: 18px 18px 0 0; font-size: 11.5px; font-weight: 600;
  letter-spacing: .2px; }
.b-exh .row > span { padding-inline: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.b-exh .c-i { text-align: center; } .b-exh .c-n { grid-column: span 2; }
.b-exh .c-sr, .b-exh .c-r { text-align: center; }
.b-ex { background: rgba(255,255,255,.98); border-inline: 1px solid transparent; border-block-end: 1px solid #f1eee8;
  padding-block: ${ROW_PAD_PX / 2}px; min-height: ${EXERCISE_IMAGE_PX + ROW_PAD_PX + 1}px; }
.b-ex.even { background: rgba(255,255,255,.98); }
.b-ex.last { border-block-end-color: transparent; border-radius: 0 0 18px 18px; }
.b-ex.ss { background: var(--tint1); }
.b-ex.ss .n, .b-ex.ss .mus span { background: #fff; }
.b-ex > div { min-width: 0; padding-inline: 6px; }
.b-ex .c-i { display: flex; justify-content: center; align-self: start; padding-block-start: 2px; }
.b-ex .n { width: 24px; height: 24px; border-radius: 50%; background: var(--tint1); color: var(--ink1); font-weight: 800; font-size: 12px;
  display: flex; align-items: center; justify-content: center; }
.b-ex .c-p { padding-inline: 0 6px; }
.b-ex .pic { width: ${EXERCISE_IMAGE_PX}px; height: ${EXERCISE_IMAGE_PX}px; border-radius: 14px; background: #efece6; object-fit: cover; display: block; }
.b-ex .pic.ph { background: var(--tint1); }
.b-ex .pic.mm { object-fit: contain; background: #fff; border: 1px solid #efece6; }
.b-ex .cr { width: ${EXERCISE_IMAGE_PX}px; margin-top: 2px; font-size: 6px; line-height: 1.2; color: #8f897f; text-align: center; overflow-wrap: anywhere; }
.b-ex .nm { font-size: ${FONT.name - 1}px; font-weight: 800; line-height: 1.4; overflow-wrap: anywhere; }
.b-ex .en { font-size: ${FONT.small - 1}px; color: #6b665d; line-height: 1.45; overflow-wrap: anywhere; }
.b-ex .mus { display: flex; flex-wrap: wrap; gap: 3px; margin-block-start: 3px; height: 19px; overflow: hidden; }
.b-ex .mus span { font-size: 10.5px; font-weight: 600; color: var(--ink1); background: var(--tint1); border-radius: 999px; padding: 0 6px; line-height: 19px; }
.b-ex .c-sr { text-align: center; font-size: 19px; font-weight: 800; color: #111; line-height: 1.3; white-space: nowrap; }
.b-ex .c-sr i { font-style: normal; font-weight: 500; color: #8f897f; margin-inline: 4px; font-size: 14px; }
.b-ex .c-r { text-align: center; font-size: 13px; font-weight: 700; color: #3d3a35; white-space: nowrap; }
.b-ex .c-d { display: flex; flex-direction: column; gap: 1px; font-size: ${FONT.small - 1}px; line-height: 1.5; color: #3d3a35; }
.b-ex .c-d .x b { color: #8f897f; font-weight: 600; }
.b-ex .c-d .note { color: #57524a; overflow-wrap: anywhere; }
.b-ex .sst { align-self: flex-start; font-size: 10.5px; color: #fff; background: var(--c2); border-radius: 999px; padding: 0 7px; line-height: 19px; font-weight: 700; margin-block-end: 2px; }
.b-ex .c-m { padding-inline: 4px; }
.b-ex .map { width: ${MUSCLE_MAP_PX}px; height: ${MUSCLE_MAP_PX}px; object-fit: contain; border-radius: 14px; background: #f6f4f0; display: block; }

.b-mt { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid transparent; border-radius: 18px; overflow: hidden; background: rgba(255,255,255,.98); box-shadow: 0 1px 2px rgba(40,30,20,.05), 0 6px 18px rgba(40,30,20,.06); }
.b-mt th { height: ${TABLE_HEAD_PX}px; background: #ebe7df; color: #57524a; font-size: 12px; font-weight: 600; text-align: center; padding-inline: 8px; }
.b-mt th:first-child { text-align: start; }
.b-mt td { height: 36px; text-align: center; border-block-start: 1px solid #efece6; font-weight: 600; font-size: 14px; }
.b-mt td.l { text-align: start; padding-inline: 12px; color: #3d3a35; }
.b-mt td.lt { font-weight: 800; color: var(--ink1); }
.b-mt td.ch { font-weight: 800; }
.b-mt small { font-size: 11px; color: #8f897f; font-weight: 500; }
.b-mt tr:nth-child(even) td { background: transparent; }

.b-meal { display: flex; gap: 8px; align-items: baseline; padding-inline: 12px; background: rgba(255,255,255,.9); border-radius: 999px; }
.b-meal .d { margin-inline-start: auto; color: #6b665d; font-size: ${FONT.small}px; white-space: nowrap; }
.b-mealc { padding: 0; overflow: hidden; }
.b-mealc .hd { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-block-end: 1px solid #efece6; }
.b-mealc .hd .nm { font-size: ${FONT.name + 1}px; font-weight: 800; color: var(--ink1); flex: 1; min-width: 0; overflow-wrap: anywhere; }
.b-mealc .hd .tm { flex: none; background: var(--c1); color: var(--on1); border-radius: 999px; padding: 1px 12px; font-weight: 700; font-size: 13px; }
.b-mealc ul { list-style: none; padding: 4px 14px; }
.b-mealc li { display: flex; gap: 10px; align-items: baseline; padding-block: 5px; border-block-end: 1px solid #f1eee8; }
.b-mealc li:last-child { border-block-end: 0; }
.b-mealc li::before { content: ''; width: 7px; height: 7px; border-radius: 4px; background: var(--c1); flex: none; transform: translateY(-2px); }
.b-mealc .it { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.b-mealc .sv { flex: none; color: #6b665d; font-size: ${FONT.small}px; }
.b-mealc .gr { flex: none; width: 64px; text-align: end; color: #57524a; font-size: ${FONT.small}px; font-weight: 600; }
.b-mealc .kc { flex: none; width: 84px; text-align: end; color: #3d3a35; font-size: ${FONT.small}px; font-weight: 700; }
.b-mealc .tot { display: flex; flex-wrap: wrap; gap: 6px 16px; background: var(--tint1); padding: 8px 14px; font-size: ${FONT.small}px; color: #3d3a35; }
.b-mealc .tot b { font-size: 14px; font-weight: 800; }
.b-mealc .tot .em b { color: var(--ink1); }

.b-rec .top { display: flex; gap: 16px; align-items: flex-start; }
.b-rec .t { flex: 1; min-width: 0; }
.b-rec .pic { flex: none; width: ${RECIPE_IMAGE_PX}px; height: ${RECIPE_IMAGE_PX}px; border-radius: 18px; object-fit: cover; background: #efece6; display: block; }
.b-rec .nm, .b-sup .nm { font-size: ${FONT.name + 1}px; font-weight: 800; overflow-wrap: anywhere; }
.b-rec .d { font-size: ${FONT.small}px; color: var(--ink1); font-weight: 600; margin-block: 2px 4px; }
.b-rec li, .b-rec .ins { font-size: ${FONT.small + 0.5}px; color: #3d3a35; }
.b-rec ul { list-style: none; columns: 2; column-gap: 16px; } .b-rec li::before { content: '• '; color: var(--c1); font-weight: 800; }
.b-rec .ins { margin-block-start: 8px; padding-block-start: 8px; border-block-start: 1px solid #f1eee8; white-space: pre-line; overflow-wrap: anywhere; }
.b-sup { display: flex; gap: 14px; align-items: center; }
.b-sup .pic { flex: none; width: ${SUPPLEMENT_IMAGE_PX}px; height: ${SUPPLEMENT_IMAGE_PX}px; border-radius: 18px; object-fit: contain; background: #fff; border: 1px solid #efece6; display: block; }
.b-sup .pic.ph { background: var(--tint1); border: 0; }
.b-sup .t { flex: 1; min-width: 0; }
.b-sup .rows { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-block-start: 2px; }
.b-sup .r { overflow-wrap: anywhere; } .b-sup .r b { color: #6b665d; font-weight: 500; margin-inline-end: 6px; }
.b-sup .note { font-size: ${FONT.small}px; color: #6b665d; }
.b-chart .ttl { font-weight: 800; margin-block-end: 6px; } .b-chart .ttl span { color: #8f897f; font-weight: 500; }
.b-chart svg { display: block; width: 100%; height: ${CHART_HEIGHT_PX}px; }
.b-photos { display: flex; gap: 16px; }
.b-photos figure { flex: 1; height: ${PHOTO_PAIR_HEIGHT_PX}px; display: flex; flex-direction: column; gap: 6px; }
.b-photos img, .b-photos .ph { flex: 1; min-height: 0; width: 100%; object-fit: cover; border-radius: 22px; background: #efece6; }
.b-photos.one figure { flex: none; width: 50%; margin-inline: auto; }
.b-photos figcaption { text-align: center; font-weight: 700; }
.b-contact { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 26px 24px 22px;
  border-radius: 28px; background: var(--tint1); border: 1px solid transparent; margin-block-start: 8px; }
.b-contact .lg { height: ${CLOSING_LOGO_PX}px; width: auto; max-width: 320px; object-fit: contain; }
.b-contact .who { font-size: 22px; font-weight: 800; color: var(--ink1); }
.b-contact .cl { font-size: 20px; font-weight: 600; color: #1c1a17; overflow-wrap: anywhere; }
.b-contact .ttl { margin-block-start: 6px; font-size: ${FONT.small}px; font-weight: 700; color: #6b665d; }
.b-contact .lines { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.b-contact .lines span { background: var(--c1); color: var(--on1); border-radius: 999px; padding: 5px 16px; font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }

.ptpdf-cover .hero { position: absolute; inset-block-start: 28px; inset-inline: 28px; height: 532px; background: var(--c1); overflow: hidden;
  border-radius: 40px; }
.ptpdf-cover .hero .cimg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ptpdf-cover .hero .tint { position: absolute; inset: 0; background: var(--c1); opacity: .55; }
.ptpdf-cover .ring { display: none; }
.ptpdf-cover .ring.r1 { width: 520px; height: 520px; inset-block-start: -180px; inset-inline-end: -160px; }
.ptpdf-cover .ring.r2 { width: 300px; height: 300px; inset-block-end: -60px; inset-inline-start: -90px; border-width: 36px; border-color: rgba(0,0,0,.06); }
.ptpdf-cover .hero.photo .ring { display: none; }
.ptpdf-cover .mark { position: absolute; inset-block-start: 0; inset-block-end: 0; inset-inline: 56px; display: flex; align-items: center; }
.ptpdf-cover .mark.start { justify-content: flex-start; } .ptpdf-cover .mark.center { justify-content: center; } .ptpdf-cover .mark.end { justify-content: flex-end; }
.ptpdf-cover .logo-card { background: #fff; border-radius: 28px; padding: 28px 32px; box-shadow: 0 18px 40px rgba(0,0,0,.18);
  display: flex; align-items: center; justify-content: center; }
.ptpdf-cover .logo-card img { display: block; max-width: var(--clogo-w); max-height: var(--clogo-h); width: auto; height: auto; object-fit: contain; }
.ptpdf-cover .mono { color: var(--on1); font-size: 46px; font-weight: 800; line-height: 1.3; max-width: 560px; text-align: center; overflow-wrap: anywhere; }
.ptpdf-cover .body { position: absolute; inset-block-start: 590px; inset-inline: 64px; inset-block-end: 150px; display: flex; flex-direction: column; gap: 10px; }
.ptpdf-cover .body > * { flex: none; }
.ptpdf-cover h1.long { font-size: 34px; line-height: 1.3; }
.ptpdf-cover .kicker { font-size: 17px; font-weight: 700; color: var(--ink1); letter-spacing: .2px; }
.ptpdf-cover h1 { font-size: 46px; line-height: 1.25; font-weight: 800; color: #111; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ptpdf-cover .ttl { display: flex; gap: 12px; align-items: stretch; font-size: 23px; font-weight: 700; color: var(--ink1); line-height: 1.45; }
.ptpdf-cover .ttl .bar { display: none; }
.ptpdf-cover .ttl span:last-child { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ptpdf-cover .sub { font-size: 18px; color: #57524a; font-weight: 500; overflow-wrap: anywhere; }
.ptpdf-cover .facts { display: flex; gap: 12px; margin-block-start: auto; }
.ptpdf-cover .facts div { flex: 1; min-width: 0; border: 1px solid #fff; border-radius: 22px; padding: 10px 16px; display: flex; flex-direction: column; background: #fff; box-shadow: 0 1px 2px rgba(40,30,20,.05), 0 6px 18px rgba(40,30,20,.06); }
.ptpdf-cover .facts .k { font-size: 13px; color: #6b665d; } .ptpdf-cover .facts .v { font-size: 18px; font-weight: 800; overflow-wrap: anywhere; }
.ptpdf-cover .strip { position: absolute; inset-block-end: 28px; inset-inline: 28px; height: 112px; background: var(--deep1); color: #fff;
  border-radius: 32px; padding: 16px 36px 12px; display: flex; flex-direction: column; justify-content: space-between; }
.ptpdf-cover .strip .cl { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.ptpdf-cover .strip .k { font-size: 13px; opacity: .75; margin-inline-end: 4px; }
.ptpdf-cover .strip .c { background: rgba(255,255,255,.14); border-radius: 999px; padding: 4px 14px; font-weight: 700; font-size: 15px; }
.ptpdf-cover .strip .disc { font-size: 11px; opacity: .75; }
`;
}
