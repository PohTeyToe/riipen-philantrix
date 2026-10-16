# Design

## Visual theme

Light and flat like Philantrix's app, with one committed surface: the agent run sits on solid mahogany, the way their dashboard's Tracked Goals cards do. Scene: a founder at a laptop in a bright co-working space between calls, judging in a minute whether this person can build the next part of their product. That rules out a dark page; the mahogany card is the one dark object on it, and it holds the machinery.

Colour strategy: restrained page, committed run card. Tinted neutrals carry the surface. Mahogany marks the agent's work, data that counted and the current selection. Orange, their call-to-action colour, marks only what needs a person. Green marks a passed check, never decoration.

## Colour

OKLCH, neutrals tinted toward the mahogany hue (29). Source: philantrix.com stylesheet, read Oct 16 2026 (#4c0000, #ea580c, #fafafa, #ebebeb, #171717).

| Token | Value | Use |
|---|---|---|
| canvas | oklch(98.4% 0.002 29) | Page (their #fafafa) |
| surface | oklch(99.7% 0.001 29) | Panels, report paper |
| sunken | oklch(96.2% 0.003 29) | Segmented controls, table heads |
| line / line-strong | oklch(92.6% 0.003 29) / oklch(86.5% 0.004 29) | Hairlines (their #ebebeb), control borders |
| ink / muted / faint | oklch(21% 0.008 29) / oklch(46% 0.01 29) / oklch(54% 0.01 29) | Text levels (ink is their #171717) |
| mah | oklch(26.2% 0.107 29.2) | Their mahogany #4c0000: run card, primary, selection |
| mah-deep | oklch(19% 0.08 29.2) | Lanes and wells inside the run card |
| mah-tint / mah-soft | oklch(96.4% 0.018 17) / oklch(87% 0.05 18) | Highlighted sources, change marks |
| on-mah / on-mah-muted | oklch(97% 0.012 30) / oklch(80% 0.04 25) | Text on the run card |
| orange / orange-ink / orange-tint | oklch(64.6% 0.194 41.1) / oklch(50% 0.15 41) / oklch(97.2% 0.022 55) | Their #ea580c: needs a person, rejected |
| green / green-ink | oklch(60% 0.14 150) / oklch(45% 0.11 150) | Passed checks |

## Typography

DM Sans (variable) for all UI, data and body. Lora (variable) for the workspace name and report titles, as their app does. Numbers use tabular lining figures.

Fixed rem scale: 11.5 eyebrow (uppercase, 0.08em tracking, like their "TRACKED GOALS"), 12.5 meta, 13.5 body, 15 emphasis, 18 panel titles, 22 report titles (Lora), 28 and 40 for figures.

## Layout

- App shell: a one-line header, a funder bar (form tabs and period), then a two-column workspace.
- Full width under the funder bar: the pipeline graph (the funder's form and the records flowing into one report). Each step opens its inspector.
- Left column, sticky: the inspector for the selected step. The agent run is the default.
- Right column: the report in the funder's own layout. The OJJDP form is a measures grid; the others are numbered questions.
- Phone: stacked. Graph chips, the run's lanes in a compact card, then the report; every inspector, the full run included, opens as a bottom sheet.
- Side by side: two funders' reports from the same build, for comparing formats.
- Panels: 12px radius, 1px line border, no heavy shadows, no nested cards.

## Components

- Pipeline graph: two input lanes (form, records) merging into guard and report. Each node: name, a count, a time. The selected node gets a mahogany outline on the rose tint, so the run card stays the one dark object. On phones the nodes become one-line chips.
- Run card: mahogany. Stats row, swimlane timeline (one lane per worker), event detail. Bars: model call (on-mah), tool call (tick), check (green pass, orange fail), review verdict, gate.
- Report field: their number and words, our answer. States: filled from records, drafted (slots linked), needs you (orange, answerable), not in records (muted, says what to track), withheld by the guard.
- Traceable number: dotted underline; selected is mahogany fill.
- Register: one row per participant, one column per day; mahogany attended, grey absent, orange gap.
- Buttons: primary mahogany, quiet white with a line border, 8px radius.

## Motion

150 to 250 ms, ease-out-quint, for state only: a changed number, a highlight moving to its source, a sheet opening, the replay playhead. Nothing on page load. Reduced motion turns it off and the replay jumps to its end.
