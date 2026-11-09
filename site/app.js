/* 九州サーキット走行カレンダー / Kyushu Track Days — front end. Plain JS, no build step. */
(() => {
  "use strict";

  const VENUE_ORDER = ["hsr", "spa", "ap"];
  const STORE_KEY = "kyushu-tracks:v2";

  // ---------- i18n ----------
  const I18N = {
    ja: {
      title: "九州サーキット走行カレンダー",
      lede: "HSR九州（熊本）・SPA直入（大分）・オートポリス（大分）の走行スケジュールをひとつに。フリー走行・イベント・レースを一目で。",
      all: "すべて", bike: "2輪", car: "4輪", list: "リスト", month: "月", today: "今日",
      searchPh: "検索（例: S3, 耐久, 走行会）", courses: "コース", legend: "凡例・クラス区分",
      legendNote: "クラス区分は各サーキットの公式案内をもとにしたもので、変更されることがあります。走行前に必ず公式サイトで確認してください。",
      disclaimer: "このサイトは非公式のまとめです。日程・走行枠・料金は予告なく変更されます。参加前に各サーキットの公式サイトで必ずご確認ください。",
      kinds: { free: "フリー走行", event: "イベント・走行会", race: "レース", school: "スクール・講習", other: "貸切・休業・体験" },
      noSlots: "走行枠・予定なし", unpublished: "スケジュール未公開", allDay: "終日", cont: "（続き）", remain: "残",
      slots: "枠", approx: "年間予定より", race: "RACE", classCodes: "クラス記号",
      noResults: "この条件に合う予定はありません。月を切り替えるか、フィルターを緩めてみてください。",
      generated: (s) => `データ取得: ${s} JST — 毎朝自動更新`,
      monthLabel: (y, m) => `${y}年${m}月`,
      weekdays: ["日", "月", "火", "水", "木", "金", "土"],
      titlesNote: "",
    },
    en: {
      title: "Kyushu Track Day Calendar",
      lede: "HSR Kyushu (Kumamoto), SPA Naoiri (Oita) and Autopolis (Oita) in one schedule. Free-run sessions, track days and races at a glance. Event names are shown as published by each circuit.",
      all: "All", bike: "Bikes", car: "Cars", list: "List", month: "Month", today: "Today",
      searchPh: "Search (e.g. S3, 耐久, drift)", courses: "Courses", legend: "Legend & class codes",
      legendNote: "Class codes follow each circuit's official guidance and may change. Always confirm on the official site before riding or driving.",
      disclaimer: "Unofficial aggregator. Dates, sessions and prices change without notice. Always check each circuit's official site before you go.",
      kinds: { free: "Free running", event: "Events & track days", race: "Races", school: "Schools & courses", other: "Private / closed / trial" },
      noSlots: "No sessions scheduled", unpublished: "Schedule not published yet", allDay: "All day", cont: "(cont.)", remain: "left",
      slots: " slots", approx: "from annual plan", race: "RACE", classCodes: "class codes",
      noResults: "Nothing matches these filters. Try another month or loosen the filters.",
      generated: (s) => `Data fetched ${s} JST — refreshed every morning`,
      monthLabel: (y, m) => `${MONTHS_EN[m - 1]} ${y}`,
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      titlesNote: "",
    },
  };
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const VENUE_EN = { hsr: { name: "HSR Kyushu", short: "HSR" }, spa: { name: "SPA Naoiri", short: "SPA" }, ap: { name: "Autopolis", short: "AP" } };
  const COURSE_EN = {
    "hsr:circuit": "Circuit course", "hsr:dream": "Dream course (mini bike)",
    "spa:onroad": "On-road course", "spa:offroad": "Forest (off-road) course",
    "ap:racing": "Racing course", "ap:lakeside": "Lakeside course",
  };
  const LEGEND_EN = {
    hsr: {
      S1: "Bikes S1 (QMSC licence, 125cc+)", S2: "Bikes S2 (QMSC licence, 125cc+)", S3: "Bikes S3 (QMSC licence, 125cc+)",
      F: "Mini bikes F (S-Dream licence, 4st <125cc / 2st <80cc)", "4": "Cars sports run (4R licence, 25 min)",
      "4D": "Cars D slot (check official table)", K: "K slot (check official table)", R: "R slot (check official table)",
    },
    spa: {
      A: "Bikes class A (251cc+, lap 40s–52s)", B: "Bikes class B (251cc+, lap 53s+)", "A.B": "Bikes A/B combined",
      MQ: "Mini bikes & 4st ≤250cc (no lap-time limit)",
    },
    ap: {
      "4F": "Cars: formula & VITA", "4TN-A": "Cars: touring / road-registered, faster than 2:30", "4TN-B": "Cars: touring / road-registered, slower than 2:30",
      "4TN": "Cars: touring / road-registered", "4ALL": "Cars: mixed (4F + 4TN)", KSP: "Karts",
      "2B-A": "Bikes 401cc+, faster than 2:10", "2B-B": "Bikes 401cc+, slower than 2:10", "2B": "Bikes 401cc+", "2S": "Bikes ≤400cc",
      "2ALL": "Bikes mixed (2B + 2S)", RS: "Riding school (TMR)", CL: "Course licence briefing day (from 10:00)",
    },
  };
  // Structural titles produced by the scraper (not event names) → English.
  const TITLE_EN = [
    [/^定休日$/, "Closed (regular holiday)"],
    [/^貸切$/, "Private booking"],
    [/^貸切（(.+)）$/, "Private booking ($1)"],
    [/^(.+) 貸切$/, "$1 (private booking)"],
    [/^体験走行$/, "Trial run"],
    [/^体験走行 可$/, "Trial run available"],
    [/^ライセンス講習 予約可$/, "Licence course bookable"],
    [/^ライセンス講習 設定日（CL）$/, "Licence course day (CL)"],
    [/^林道コース 予約可$/, "Forest course bookable"],
    [/^貸切予約 受付中（7日前まで）$/, "Open for private booking (7 days ahead)"],
    [/^コースメンテナンス$/, "Course maintenance"],
    [/^コースクローズ$/, "Course closed"],
    [/^コースクリア$/, "Course clear (no sessions)"],
    [/^施設クローズ.*$/, "Facility closed"],
    [/^ライディングスクール（RS）$/, "Riding school (RS)"],
    [/^ミニバイク\(1日\)$/, "Mini bike (full day)"],
    [/^ミニバイク\(半日\)$/, "Mini bike (half day)"],
    [/^モタード（1日）$/, "Supermoto (full day)"],
    [/^モタード（半日）$/, "Supermoto (half day)"],
    [/^年間表彰式$/, "Annual awards ceremony"],
    [/^特別スポーツ走行$/, "Special sports run"],
  ];
  const SOURCE_EN = [
    [/走行スケジュール/, "run schedule"], [/コーススケジュール/, "course schedule"], [/オンロード/, "on-road "], [/林道/, "forest "],
    [/年間カレンダー/, "annual calendar"], [/イベントスケジュール/, "event schedule"], [/年間スケジュール/, "annual schedule"],
    [/4輪走行会一覧/, "car track-day list"], [/2輪走行会一覧/, "bike track-day list"], [/前回データを使用/, "using previous data"],
    [/(\d{4})年(\d{1,2})月/, "$1-$2"],
  ];
  const NOTE_EN = [
    [/PDFから(\d+)件抽出、未公開月の(\d+)件を採用/, "$1 parsed from PDF, $2 used for unpublished months"],
    [/未公開/, "not published yet"], [/調整中/, "pending"], [/更新/, " updated"], [/参照リンクのみ（自動解析なし）/, "reference link only (not parsed)"],
    [/全ソース取得失敗のため前回分を保持/, "all sources failed; kept previous data"], [/月/, ""],
  ];

  const state = {
    lang: "ja", // Japanese by default regardless of browser language; the toggle is remembered per browser
    venues: new Set(VENUE_ORDER),
    courses: null, // Set of "venue:course"; null = all
    kinds: new Set(["free", "event", "race", "school", "other"]),
    vehicle: "all",
    view: "list",
    month: null, // "YYYY-MM"
    query: "",
    openSlots: new Set(),
  };
  const KIND_GROUPS = [
    { id: "free", kinds: ["free"], color: "var(--accent)" },
    { id: "event", kinds: ["event"], color: "var(--text-2)" },
    { id: "race", kinds: ["race"], color: "var(--race)" },
    { id: "school", kinds: ["school"], color: "var(--school)" },
    { id: "other", kinds: ["private", "closed", "open", "trial"], color: "var(--closed)" },
  ];

  let DATA = null;
  let byDate = new Map();
  let todayISO = null;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const T = () => I18N[state.lang];
  const pad = (n) => String(n).padStart(2, "0");
  const isoToDate = (iso) => new Date(iso + "T00:00:00");
  const addDays = (iso, n) => {
    const d = isoToDate(iso);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const monthOf = (iso) => iso.slice(0, 7);
  const shiftMonth = (ym, n) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const daysInMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };
  const timeRange = (a, b) => (a && b ? `${a}–${b}` : a ? `${a}–` : "");
  const kindGroup = (kind) => KIND_GROUPS.find((g) => g.kinds.includes(kind))?.id || "other";

  const venueName = (v) => (state.lang === "en" ? VENUE_EN[v].name : DATA.venues[v].name);
  const venueShort = (v) => (state.lang === "en" ? VENUE_EN[v].short : DATA.venues[v].short);
  const courseName = (key) => (state.lang === "en" ? COURSE_EN[key] || key : DATA.courses[key] || key);
  const legendFor = (v, cls) => (state.lang === "en" ? LEGEND_EN[v]?.[cls] : DATA.legend?.[v]?.[cls]) || null;
  function trTitle(s) {
    if (state.lang !== "en") return s;
    for (const [re, rep] of TITLE_EN) if (re.test(s)) return s.replace(re, rep);
    return s;
  }
  const title = (e) => trTitle(e.title);
  function tr(list, s) {
    if (state.lang !== "en" || !s) return s || "";
    let out = s;
    for (const [re, rep] of list) out = out.replace(new RegExp(re.source, "g"), rep);
    return out.replace(/\s+/g, " ").trim();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (["ja", "en"].includes(s.lang)) state.lang = s.lang;
      if (Array.isArray(s.venues) && s.venues.length) state.venues = new Set(s.venues);
      if (Array.isArray(s.courses)) state.courses = new Set(s.courses);
      if (Array.isArray(s.kinds) && s.kinds.length) state.kinds = new Set(s.kinds);
      if (["all", "bike", "car"].includes(s.vehicle)) state.vehicle = s.vehicle;
      if (["list", "month"].includes(s.view)) state.view = s.view;
    } catch (_) { /* storage unavailable */ }
  }
  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: state.lang, venues: [...state.venues], courses: state.courses ? [...state.courses] : null,
        kinds: [...state.kinds], vehicle: state.vehicle, view: state.view,
      }));
    } catch (_) { /* ignore */ }
  }

  // ---------- data ----------
  async function load() {
    const res = await fetch("data/events.json", { cache: "no-cache" });
    DATA = await res.json();
    todayISO = localToday();
    byDate = new Map();
    for (const e of DATA.events) {
      let d = e.date;
      const end = e.date_end || e.date;
      let guard = 0;
      while (d <= end && guard++ < 31) {
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d).push(d === e.date ? e : { ...e, cont: true });
        d = addDays(d, 1);
      }
    }
    if (!state.month) state.month = monthOf(todayISO);
  }
  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const courseKey = (e) => `${e.venue}:${e.course}`;

  function passes(e) {
    if (!state.venues.has(e.venue)) return false;
    if (state.courses && !state.courses.has(courseKey(e))) return false;
    if (!state.kinds.has(kindGroup(e.kind))) return false;
    if (state.vehicle !== "all" && e.vehicle && e.vehicle !== state.vehicle && e.vehicle !== "mixed") return false;
    if (state.vehicle !== "all" && e.kind === "free" && !e.vehicle) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const hay = `${e.title} ${title(e)} ${e.cls || ""} ${e.note || ""} ${DATA.courses[courseKey(e)] || ""} ${COURSE_EN[courseKey(e)] || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  const eventsOn = (date) => (byDate.get(date) || []).filter(passes);

  /** Group free-run slots of one course by class. */
  function groupFree(events) {
    const map = new Map();
    for (const e of events) {
      if (e.kind !== "free") continue;
      const key = e.cls || e.title;
      if (!map.has(key)) map.set(key, { cls: key, label: trTitle(key), vehicle: e.vehicle, start: e.start, end: e.end, count: 0, slots: [], special: !e.cls });
      const g = map.get(key);
      g.count++;
      g.slots.push(e);
      if (e.start && (!g.start || e.start < g.start)) g.start = e.start;
      if (e.end && (!g.end || e.end > g.end)) g.end = e.end;
    }
    for (const g of map.values()) g.slots.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return [...map.values()].sort((a, b) => (a.start || "99").localeCompare(b.start || "99") || a.cls.localeCompare(b.cls));
  }

  // ---------- static text ----------
  function applyLanguage() {
    const t = T();
    document.documentElement.lang = state.lang;
    document.title = t.title;
    document.querySelectorAll("[data-i18n]").forEach((n) => { const v = t[n.dataset.i18n]; if (typeof v === "string") n.textContent = v; });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((n) => { n.placeholder = t[n.dataset.i18nPlaceholder]; });
    document.querySelectorAll("#lang-switch .chip").forEach((b) => {
      b.classList.toggle("on", b.dataset.lang === state.lang);
      b.onclick = () => { state.lang = b.dataset.lang; applyLanguage(); renderStatic(); update(); };
    });
  }

  // ---------- controls ----------
  function renderControls() {
    const t = T();
    const vf = $("#venue-filter");
    vf.innerHTML = "";
    for (const v of VENUE_ORDER) {
      const b = el("button", "chip", venueName(v));
      b.dataset.venue = v;
      b.classList.toggle("on", state.venues.has(v));
      b.addEventListener("click", () => {
        if (state.venues.has(v) && state.venues.size === 1) return;
        state.venues.has(v) ? state.venues.delete(v) : state.venues.add(v);
        update();
      });
      vf.appendChild(b);
    }
    const kf = $("#kind-filter");
    kf.innerHTML = "";
    for (const g of KIND_GROUPS) {
      const b = el("button", "chip", t.kinds[g.id]);
      b.dataset.kind = g.id;
      b.classList.toggle("on", state.kinds.has(g.id));
      b.addEventListener("click", () => {
        state.kinds.has(g.id) ? state.kinds.delete(g.id) : state.kinds.add(g.id);
        update();
      });
      kf.appendChild(b);
    }
    const cf = $("#course-filter");
    cf.innerHTML = "";
    const allCourses = Object.keys(DATA.courses);
    for (const key of allCourses) {
      const [v] = key.split(":");
      const b = el("button", "chip", `${venueShort(v)} ${courseName(key)}`);
      b.classList.toggle("on", !state.courses || state.courses.has(key));
      b.addEventListener("click", () => {
        if (!state.courses) state.courses = new Set(allCourses);
        state.courses.has(key) ? state.courses.delete(key) : state.courses.add(key);
        if (state.courses.size === allCourses.length) state.courses = null;
        update();
      });
      cf.appendChild(b);
    }
    document.querySelectorAll("#vehicle-filter .chip").forEach((b) => {
      b.classList.toggle("on", b.dataset.vehicle === state.vehicle);
      b.onclick = () => { state.vehicle = b.dataset.vehicle; update(); };
    });
    document.querySelectorAll("#view-switch .chip").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === state.view);
      b.onclick = () => { state.view = b.dataset.view; update(); };
    });
    $("#prev-month").onclick = () => { state.month = shiftMonth(state.month, -1); update(); };
    $("#next-month").onclick = () => { state.month = shiftMonth(state.month, 1); update(); };
    $("#today-btn").onclick = () => { state.month = monthOf(todayISO); update(); scrollToToday(); };
    const search = $("#search");
    search.value = state.query;
    let timer;
    search.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.query = search.value.trim(); renderView(); }, 120); };
    const [y, m] = state.month.split("-").map(Number);
    $("#month-label").textContent = t.monthLabel(y, m);
  }

  function update() {
    saveState();
    renderControls();
    renderView();
  }

  // ---------- list view ----------
  function renderView() {
    const view = $("#view");
    view.innerHTML = "";
    if (state.view === "month") renderMonth(view);
    else renderList(view);
  }

  function renderList(view) {
    const ym = state.month;
    const n = daysInMonth(ym);
    let any = false;
    for (let d = 1; d <= n; d++) {
      const iso = `${ym}-${pad(d)}`;
      const events = eventsOn(iso);
      if (events.length) any = true;
      view.appendChild(renderDay(iso, events));
    }
    if (!any) view.appendChild(el("p", "no-results", T().noResults));
    requestAnimationFrame(() => { if (ym === monthOf(todayISO)) scrollToToday(false); });
  }

  function scrollToToday(smooth = true) {
    const node = document.getElementById("day-" + todayISO);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - ($("#controls").offsetHeight + 8);
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  function renderDay(iso, events) {
    const t = T();
    const d = isoToDate(iso);
    const wd = d.getDay();
    const row = el("div", "day");
    row.id = "day-" + iso;
    if (iso < todayISO) row.classList.add("past");
    if (iso === todayISO) row.classList.add("today");
    if (!events.length) row.classList.add("empty-day");

    const date = el("div", "date" + (wd === 6 ? " sat" : wd === 0 ? " sun" : ""));
    date.appendChild(el("span", "m", state.lang === "en" ? MONTHS_EN[d.getMonth()] : `${d.getMonth() + 1}月`));
    date.appendChild(el("span", "d", String(d.getDate())));
    date.appendChild(el("span", "w", state.lang === "en" ? t.weekdays[wd] : `(${t.weekdays[wd]})`));
    if (iso === todayISO) date.appendChild(el("span", "today-tag", "TODAY"));
    row.appendChild(date);

    for (const v of VENUE_ORDER) {
      if (!state.venues.has(v)) continue;
      row.appendChild(renderVenueCard(v, events.filter((e) => e.venue === v), iso));
    }
    return row;
  }

  function renderVenueCard(v, events, iso) {
    const t = T();
    const card = el("div", "venue-card");
    const head = el("div", "vh");
    head.appendChild(el("span", "vname", venueName(v)));
    card.appendChild(head);

    if (!events.length) {
      card.classList.add("none");
      head.appendChild(el("span", "vstatus", monthPublished(v, iso) ? t.noSlots : t.unpublished));
      return card;
    }
    const courses = [...new Set(events.map((e) => e.course))];
    const multi = courses.length > 1 || !isMainCourse(v, courses[0]);
    let allClosed = true;
    for (const c of courses) {
      const evs = events.filter((e) => e.course === c);
      const block = el("div", "course-block");
      if (multi) block.appendChild(el("div", "course-name", courseName(`${v}:${c}`)));
      const closed = evs.filter((e) => e.kind === "closed" && !e.start);
      const others = evs.filter((e) => e.kind !== "free" && !(e.kind === "closed" && !e.start));
      const free = groupFree(evs);
      if (free.length || others.some((e) => ["event", "race", "school", "private", "open"].includes(e.kind))) allClosed = false;

      if (closed.length && !free.length && !others.length) {
        block.appendChild(renderItem(closed[0]));
        card.appendChild(block);
        continue;
      }
      if (free.length) {
        const fr = el("div", "free-row");
        for (const g of free) fr.appendChild(renderFreeChip(g, iso, v, c));
        block.appendChild(fr);
        for (const g of free) {
          const key = `${iso}|${v}|${c}|${g.cls}`;
          if (state.openSlots.has(key)) block.appendChild(renderSlots(g));
        }
      }
      const items = el("div", "items");
      const main = others.filter((e) => ["event", "race", "school", "private", "closed"].includes(e.kind));
      const flags = others.filter((e) => ["open", "trial"].includes(e.kind));
      for (const e of closed) items.appendChild(renderItem(e));
      for (const e of main.sort(sortItems)) items.appendChild(renderItem(e));
      if (items.childNodes.length) block.appendChild(items);
      if (flags.length) {
        const f = el("div", "flags");
        for (const e of flags) f.appendChild(el("span", "", `◦ ${title(e)}${e.start ? ` ${timeRange(e.start, e.end)}` : ""}`));
        block.appendChild(f);
      }
      card.appendChild(block);
    }
    if (allClosed) card.classList.add("closed");
    return card;
  }

  const KIND_RANK = { race: 0, event: 1, school: 2, private: 3, closed: 4 };
  const sortItems = (a, b) => (a.start || "00").localeCompare(b.start || "00") || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  const isMainCourse = (v, c) => (v === "hsr" && c === "circuit") || (v === "spa" && c === "onroad") || (v === "ap" && c === "racing");

  function monthPublished(v, iso) {
    const ym = iso.slice(0, 7);
    for (const [d, evs] of byDate) if (d.startsWith(ym) && evs.some((e) => e.venue === v && !e.approx)) return true;
    return false;
  }

  function renderFreeChip(g, iso, v, c) {
    const b = el("button", "free" + (g.vehicle === "car" ? " car" : g.vehicle === "kart" ? " kart" : "") + (g.special ? " special" : ""));
    b.title = legendFor(v, g.cls) || g.label;
    b.appendChild(el("span", "cls", g.special ? shortTitle(g.label).slice(0, 30) : g.label));
    if (g.start) b.appendChild(el("span", "rng", timeRange(g.start, g.end)));
    if (g.count > 1) b.appendChild(el("span", "n", `×${g.count}`));
    const key = `${iso}|${v}|${c}|${g.cls}`;
    b.addEventListener("click", () => {
      state.openSlots.has(key) ? state.openSlots.delete(key) : state.openSlots.add(key);
      renderView();
    });
    return b;
  }

  function renderSlots(g) {
    const t = T();
    const box = el("div", "slots");
    const legend = legendFor(g.slots[0].venue, g.cls);
    if (legend) {
      const l = el("div", "s");
      l.style.gridColumn = "1 / -1";
      l.textContent = legend;
      box.appendChild(l);
    }
    for (const s of g.slots) {
      const row = el("div", "s");
      row.appendChild(el("span", "", s.start ? timeRange(s.start, s.end) : t.allDay));
      const r = el("span", "r" + (s.remain === "×" ? " full" : ""));
      r.textContent = [s.remain ? (state.lang === "en" ? `${s.remain} ${t.remain}` : `${t.remain} ${s.remain}`) : "", s.price ? `¥${s.price.toLocaleString()}` : ""].filter(Boolean).join(" ");
      row.appendChild(r);
      box.appendChild(row);
    }
    return box;
  }

  function renderItem(e) {
    const t = T();
    const it = el("div", `item ${e.kind}`);
    it.appendChild(el("span", "t" + (e.start ? "" : " na"), e.start ? timeRange(e.start, e.end) : e.cont ? t.cont : t.allDay));
    const ttl = el("span", "title");
    const text = title(e);
    if (e.url) {
      const a = el("a", "", text);
      a.href = e.url; a.target = "_blank"; a.rel = "noopener";
      ttl.appendChild(a);
    } else ttl.textContent = text;
    if (e.note) {
      ttl.appendChild(document.createTextNode(" "));
      ttl.appendChild(el("span", "muted small", e.note.length > 60 ? e.note.slice(0, 60) + "…" : e.note));
    }
    it.appendChild(ttl);
    if (e.vehicle === "bike" || e.vehicle === "car") it.appendChild(el("span", "tag v", e.vehicle === "bike" ? t.bike : t.car));
    if (e.kind === "race") it.appendChild(el("span", "tag", t.race));
    if (e.approx) it.appendChild(el("span", "approx", t.approx));
    return it;
  }

  // ---------- month view ----------
  function renderMonth(view) {
    const t = T();
    const cal = el("div", "calendar");
    t.weekdays.forEach((w, i) => cal.appendChild(el("div", "wd" + (i === 0 ? " sun" : i === 6 ? " sat" : ""), w)));
    const ym = state.month;
    const first = isoToDate(`${ym}-01`);
    for (let i = 0; i < first.getDay(); i++) cal.appendChild(el("div", "cell blank"));
    const n = daysInMonth(ym);
    for (let d = 1; d <= n; d++) {
      const iso = `${ym}-${pad(d)}`;
      const wd = (first.getDay() + d - 1) % 7;
      const cell = el("div", "cell" + (wd === 0 ? " sun" : wd === 6 ? " sat" : ""));
      if (iso < todayISO) cell.classList.add("past");
      if (iso === todayISO) cell.classList.add("today");
      cell.appendChild(el("div", "n", String(d)));
      const events = eventsOn(iso);
      for (const v of VENUE_ORDER) {
        if (!state.venues.has(v)) continue;
        const evs = events.filter((e) => e.venue === v);
        if (!evs.length) continue;
        const line = el("div", "mini");
        line.appendChild(el("span", "v", venueShort(v)));
        const body = el("span", "body");
        const parts = [];
        const free = groupFree(evs);
        if (free.length) {
          const f = el("span", "f" + (free.every((g) => g.vehicle === "car") ? " car" : ""));
          f.textContent = free.map((g) => (g.special ? "★" : g.label)).join(" ");
          parts.push(f);
        }
        const races = evs.filter((e) => e.kind === "race");
        const others = evs.filter((e) => ["event", "school"].includes(e.kind));
        const closed = evs.filter((e) => e.kind === "closed" && !e.start);
        const priv = evs.filter((e) => e.kind === "private");
        for (const r of races.slice(0, 2)) parts.push(el("span", "r", "★ " + shortTitle(title(r))));
        for (const o of others.slice(0, 2)) parts.push(el("span", o.kind === "school" ? "s" : "e", shortTitle(title(o))));
        if (!parts.length && closed.length) parts.push(el("span", "c", title(closed[0])));
        else if (!parts.length && priv.length) parts.push(el("span", "c", title({ title: "貸切" })));
        parts.forEach((p, i) => { if (i) body.appendChild(document.createTextNode(" · ")); body.appendChild(p); });
        line.appendChild(body);
        cell.appendChild(line);
      }
      cell.addEventListener("click", () => {
        state.view = "list";
        update();
        requestAnimationFrame(() => {
          const node = document.getElementById("day-" + iso);
          if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - ($("#controls").offsetHeight + 8), behavior: "smooth" });
        });
      });
      cal.appendChild(cell);
    }
    view.appendChild(cal);
  }

  const shortTitle = (s) => s.replace(/（[^）]*）|\([^)]*\)/g, "").replace(/※.*$/, "").trim().slice(0, 22);

  // ---------- legend & footer ----------
  function renderStatic() {
    const t = T();
    const lk = $("#legend-kinds");
    lk.innerHTML = "";
    for (const g of KIND_GROUPS) {
      const s = el("span", "k", t.kinds[g.id]);
      s.style.setProperty("--c", g.color);
      lk.appendChild(s);
    }
    const lc = $("#legend-classes");
    lc.innerHTML = "";
    for (const v of VENUE_ORDER) {
      const lg = DATA.legend?.[v];
      if (!lg) continue;
      const box = el("div");
      box.appendChild(el("h4", "", `${venueName(v)} ${t.classCodes}`));
      const dl = el("dl");
      for (const k of Object.keys(lg)) {
        dl.appendChild(el("dt", "", k));
        dl.appendChild(el("dd", "", legendFor(v, k) || lg[k]));
      }
      box.appendChild(dl);
      lc.appendChild(box);
    }
    const src = $("#sources");
    src.innerHTML = "";
    for (const s of DATA.sources) {
      const row = el("div", "src");
      row.appendChild(el("span", s.ok ? "ok" : "err", s.ok ? "OK" : "ERR"));
      const course = s.course && s.course !== "all" && DATA.courses[`${s.venue}:${s.course}`] ? ` ${courseName(`${s.venue}:${s.course}`)}` : "";
      const label = `${s.venue in VENUE_EN ? venueShort(s.venue) : s.venue}${course} ${tr(SOURCE_EN, s.label)}`;
      if (s.url) {
        const a = el("a", "", label); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; row.appendChild(a);
      } else row.appendChild(el("span", "", label));
      if (s.note) row.appendChild(el("span", "note", tr(NOTE_EN, s.note)));
      src.appendChild(row);
    }
    const gen = new Date(DATA.generated_at);
    $("#generated").textContent = t.generated(gen.toLocaleString(state.lang === "en" ? "en-GB" : "ja-JP", { timeZone: "Asia/Tokyo" }));
  }

  // ---------- boot ----------
  loadState();
  load().then(() => {
    applyLanguage();
    renderStatic();
    update();
  }).catch((err) => {
    $("#view").textContent = "Failed to load data / データを読み込めませんでした: " + err;
  });
})();
