# kyushu-tracks

Unofficial aggregator of HSR九州 / SPA直入 / オートポリス schedules. See README.md for the
source table. Key facts that are not obvious from the code:

- `scraper/build.py` is the only entry point; it writes `site/data/events.json`. Run with
  `python -X utf8 scraper/build.py` on Windows so Japanese output prints.
- `site/` is plain static HTML/CSS/JS — no bundler. Preview with the `kyushu-tracks` launch config
  (python http.server on port 8765, configured in `../.claude/launch.json`).
- Design follows the ninja471.com system: dark bg, ivory #e8e6df text, cyan #00a8ff accent,
  Cormorant Garamond headings + DM Mono.
- Kinds: free / event / race / school / private / closed / open / trial. `classify()` in
  `common.py` is keyword based; fix mis-tagged titles there, not in the UI.
- Years are inferred (`infer_year`) because none of the sites print them on schedule tables.
- HSR's annual event PDF is intentionally not parsed (text layer has no usable month columns).
- Autopolis's annual PDF URL is discovered from the /ap/ homepage each run; PDF events are only
  used for months whose HTML table is still 調整中.
- UI strings are bilingual (ja/en) in `site/app.js` (`I18N`, `TITLE_EN`, `LEGEND_EN`, `COURSE_EN`). Event
  titles stay in Japanese; only scraper-generated structural titles are translated via `TITLE_EN`.
- Deployed as a GitHub Pages *project* site of sryan471, so it is served at ninja471.com/kyushu-tracks/
  (the user site's custom domain) — no copy into the sryan471.github.io repo is needed.
