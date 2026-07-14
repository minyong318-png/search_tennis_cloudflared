# Reference vs implementation

- Reference file: `docs/design-reference/reference-design.png`
- Extracted direction: soft off-white canvas, black text, tennis green accent, thin borders, low shadow, three-column court desktop layout, mobile-first bottom-sheet interactions, tournament list + calendar pairing.
- Court desktop: left hero/filter/stat column, central availability board, right selection panel implemented. The existing Supabase data adapter and reservation URL logic are preserved.
- Court mobile: existing facility cards, time-first flow, slot/facility sheets, and action bar are preserved; visual tone now follows the reference skin.
- Tournament desktop: filter row, quick dates, horizontal list area, calendar panel, date grouping, and participant progress bars are implemented.
- Tournament mobile: existing list/calendar switching and filter bottom sheet are preserved with the reference color/radius/shadow system.
- Ads/SEO/legal content: existing guide/footer/legal links are kept. Ads are not inserted into selection panel, mobile slot sheet, or primary CTA areas.
- Remaining differences: reference mock shows hand-picked sample slots and facility images; production uses live Supabase data, so empty/closed dates can render fewer cells. The tennis court image is a CSS placeholder unless a facility image URL exists later.

Implemented screenshots:

- `docs/design-reference/implemented/desktop-full.png`
- `docs/design-reference/implemented/desktop-court.png`
- `docs/design-reference/implemented/desktop-tournament.png`
- `docs/design-reference/implemented/mobile-court.png`
- `docs/design-reference/implemented/mobile-court-sheet.png`
- `docs/design-reference/implemented/mobile-tournament-calendar.png`
