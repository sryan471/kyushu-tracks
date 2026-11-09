/* 九州サーキット走行カレンダー — front end. Plain JS, no build step. */
(() => {
  "use strict";

  const VENUE_ORDER = ["hsr", "spa", "ap"];
  const KIND_GROUPS = [
    { id: "free", label: "フリー走行", kinds: ["free"], color: "var(--accent)" },
    { id: "event", label: "イベント・走行会", kinds: ["event"], color: "var(--text-2)" },
    { id: "race", label: "レース", kinds: ["race"], color: "var(--race)" },
    { id: "school", label: "スクール・講習", kinds: ["school"], color: "var(--school)" },
    { id: "other", label: "貸切・休業・体験", kinds: ["private", "closed", "open", "trial"], color: "var(--closed)" },
  ];
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const STORE_KEY = "kyushu-tracks:v1";

  const state = {
    venues: new Set(VENUE_ORDER),
    courses: null, // Set of "venue:course"; null = all
    kinds: new Set(["free", "event", "race", "school", "other"]),
    vehicle: "all",
    view: "list",
    month: null, // "YYYY-MM"
    query: "",
    openSlots: new Set(),
  };

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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
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
        venues: [...state.venues], courses: state.courses ? [...state.courses] : null,
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
      // expand multi-day events onto each day they cover
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

  function courseKey(e) { return `${e.venue}:${e.course}`; }

  function passes(e) {
    if (!state.venues.has(e.venue)) return false;
    if (state.courses && !state.courses.has(courseKey(e))) return false;
    if (!state.kinds.has(kindGroup(e.kind))) return false;
    if (state.vehicle !== "all" && e.vehicle && e.vehicle !== state.vehicle && e.vehicle !== "mixed") return false;
    if (state.vehicle !== "all" && e.kind === "free" && !e.vehicle) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const hay = `${e.title} ${e.cls || ""} ${e.note || ""} ${DATA.courses[courseKey(e)] || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function eventsOn(date) { return (byDate.get(date) || []).filter(passes); }

  /** Group free-run slots of one course by class: {cls, vehicle, start, end, count, slots[]} */
  function groupFree(events) {
    const map = new Map();
    for (const e of events) {
      if (e.kind !== "free") continue;
      const key = e.cls || e.title;
      if (!map.has(key)) map.set(key, { cls: key, vehicle: e.vehicle, start: e.start, end: e.end, count: 0, slots: [], special: !e.cls });
      const g = map.get(key);
      g.count++;
      g.slots.push(e);
      if (e.start && (!g.start || e.start < g.start)) g.start = e.start;
      if (e.end && (!g.end || e.end > g.end)) g.end = e.end;
    }
    for (const g of map.values()) g.slots.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return [...map.values()].sort((a, b) => (a.start || "99").localeCompare(b.start || "99") || a.cls.localeCompare(b.cls));
  }

  // ---------- controls ----------
  function renderControls() {
    const vf = $("#venue-filter");
    vf.innerHTML = "";
    for (const v of VENUE_ORDER) {
      const b = el("button", "chip", DATA.venues[v].name);
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
      const b = el("button", "chip", g.label);
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
      const b = el("button", "chip", `${DATA.venues[v].short} ${DATA.courses[key]}`);
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
    let t;
    search.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.query = search.value.trim(); renderView(); }, 120); };
    const [y, m] = state.month.split("-");
    $("#month-label").textContent = `${y}年${Number(m)}月`;
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
      const row = renderDay(iso, events);
      if (events.length) any = true;
      view.appendChild(row);
    }
    if (!any) view.appendChild(el("p", "no-results", "この条件に合う予定はありません。月を切り替えるか、フィルターを緩めてみてください。"));
    requestAnimationFrame(() => { if (ym === monthOf(todayISO)) scrollToToday(false); });
  }

  function scrollToToday(smooth = true) {
    const node = document.getElementById("day-" + todayISO);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - ($("#controls").offsetHeight + 8);
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  function renderDay(iso, events) {
    const d = isoToDate(iso);
    const wd = d.getDay();
    const row = el("div", "day");
    row.id = "day-" + iso;
    if (iso < todayISO) row.classList.add("past");
    if (iso === todayISO) row.classList.add("today");
    if (!events.length) row.classList.add("empty-day");

    const date = el("div", "date" + (wd === 6 ? " sat" : wd === 0 ? " sun" : ""));
    date.appendChild(el("span", "m", `${d.getMonth() + 1}月`));
    date.appendChild(el("span", "d", String(d.getDate())));
    date.appendChild(el("span", "w", `(${WEEKDAYS[wd]})`));
    if (iso === todayISO) date.appendChild(el("span", "today-tag", "TODAY"));
    row.appendChild(date);

    for (const v of VENUE_ORDER) {
      if (!state.venues.has(v)) continue;
      row.appendChild(renderVenueCard(v, events.filter((e) => e.venue === v), iso));
    }
    return row;
  }

  function renderVenueCard(v, events, iso) {
    const card = el("div", "venue-card");
    const head = el("div", "vh");
    head.appendChild(el("span", "vname", DATA.venues[v].name));
    card.appendChild(head);

    if (!events.length) {
      card.classList.add("none");
      head.appendChild(el("span", "vstatus", monthPublished(v, iso) ? "走行枠・予定なし" : "スケジュール未公開"));
      return card;
    }
    // group by course
    const courses = [...new Set(events.map((e) => e.course))];
    const multi = courses.length > 1 || !isMainCourse(v, courses[0]);
    let allClosed = true;
    for (const c of courses) {
      const evs = events.filter((e) => e.course === c);
      const block = el("div", "course-block");
      if (multi) block.appendChild(el("div", "course-name", DATA.courses[`${v}:${c}`] || c));
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
        for (const e of flags) f.appendChild(el("span", "", `◦ ${e.title}${e.start ? ` ${timeRange(e.start, e.end)}` : ""}`));
        block.appendChild(f);
      }
      card.appendChild(block);
    }
    if (allClosed) card.classList.add("closed");
    return card;
  }

  const KIND_RANK = { race: 0, event: 1, school: 2, private: 3, closed: 4 };
  function sortItems(a, b) {
    return (a.start || "00").localeCompare(b.start || "00") || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  }

  function isMainCourse(v, c) {
    return (v === "hsr" && c === "circuit") || (v === "spa" && c === "onroad") || (v === "ap" && c === "racing");
  }

  function monthPublished(v, iso) {
    const ym = iso.slice(0, 7);
    for (const [d] of byDate) if (d.startsWith(ym) && byDate.get(d).some((e) => e.venue === v && !e.approx)) return true;
    return false;
  }

  function renderFreeChip(g, iso, v, c) {
    const b = el("button", "free" + (g.vehicle === "car" ? " car" : g.vehicle === "kart" ? " kart" : "") + (g.special ? " special" : ""));
    b.title = legendFor(v, g.cls) || g.cls;
    b.appendChild(el("span", "cls", g.special ? shortTitle(g.cls).slice(0, 30) : g.cls));
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
      row.appendChild(el("span", "", s.start ? timeRange(s.start, s.end) : "終日"));
      const r = el("span", "r" + (s.remain === "×" ? " full" : ""));
      r.textContent = [s.remain ? `残 ${s.remain}` : "", s.price ? `¥${s.price.toLocaleString()}` : ""].filter(Boolean).join(" ");
      row.appendChild(r);
      box.appendChild(row);
    }
    return box;
  }

  function renderItem(e) {
    const it = el("div", `item ${e.kind}`);
    const t = el("span", "t" + (e.start ? "" : " na"), e.start ? timeRange(e.start, e.end) : e.cont ? "（続き）" : "終日");
    it.appendChild(t);
    const title = el("span", "title");
    if (e.url) {
      const a = el("a", "", e.title);
      a.href = e.url; a.target = "_blank"; a.rel = "noopener";
      title.appendChild(a);
    } else title.textContent = e.title;
    if (e.note) {
      title.appendChild(document.createTextNode(" "));
      title.appendChild(el("span", "muted small", e.note.length > 60 ? e.note.slice(0, 60) + "…" : e.note));
    }
    it.appendChild(title);
    if (e.vehicle === "bike" || e.vehicle === "car") it.appendChild(el("span", "tag v", e.vehicle === "bike" ? "2輪" : "4輪"));
    if (e.kind === "race") it.appendChild(el("span", "tag", "RACE"));
    if (e.approx) it.appendChild(el("span", "approx", "年間予定より"));
    return it;
  }

  function legendFor(v, cls) {
    const lg = DATA.legend?.[v];
    return lg ? lg[cls] : null;
  }

  // ---------- month view ----------
  function renderMonth(view) {
    const cal = el("div", "calendar");
    ["日", "月", "火", "水", "木", "金", "土"].forEach((w, i) => cal.appendChild(el("div", "wd" + (i === 0 ? " sun" : i === 6 ? " sat" : ""), w)));
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
        line.appendChild(el("span", "v", DATA.venues[v].short));
        const body = el("span", "body");
        const parts = [];
        const free = groupFree(evs);
        if (free.length) {
          const f = el("span", "f" + (free.every((g) => g.vehicle === "car") ? " car" : ""));
          f.textContent = free.map((g) => g.cls).join(" ");
          parts.push(f);
        }
        const races = evs.filter((e) => e.kind === "race");
        const others = evs.filter((e) => ["event", "school"].includes(e.kind));
        const closed = evs.filter((e) => e.kind === "closed" && !e.start);
        const priv = evs.filter((e) => e.kind === "private");
        for (const r of races.slice(0, 2)) parts.push(el("span", "r", "★ " + shortTitle(r.title)));
        for (const o of others.slice(0, 2)) parts.push(el("span", o.kind === "school" ? "s" : "e", shortTitle(o.title)));
        if (!parts.length && closed.length) parts.push(el("span", "c", closed[0].title));
        else if (!parts.length && priv.length) parts.push(el("span", "c", "貸切"));
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

  function shortTitle(t) {
    return t.replace(/（[^）]*）|\([^)]*\)/g, "").replace(/※.*$/, "").trim().slice(0, 22);
  }

  // ---------- legend & footer ----------
  function renderStatic() {
    const lk = $("#legend-kinds");
    for (const g of KIND_GROUPS) {
      const s = el("span", "k", g.label);
      s.style.setProperty("--c", g.color);
      lk.appendChild(s);
    }
    const lc = $("#legend-classes");
    for (const v of VENUE_ORDER) {
      const lg = DATA.legend?.[v];
      if (!lg) continue;
      const box = el("div");
      box.appendChild(el("h4", "", `${DATA.venues[v].name} クラス記号`));
      const dl = el("dl");
      for (const [k, desc] of Object.entries(lg)) {
        dl.appendChild(el("dt", "", k));
        dl.appendChild(el("dd", "", desc));
      }
      box.appendChild(dl);
      lc.appendChild(box);
    }
    const src = $("#sources");
    for (const s of DATA.sources) {
      const row = el("div", "src");
      row.appendChild(el("span", s.ok ? "ok" : "err", s.ok ? "OK" : "ERR"));
      const label = `${DATA.venues[s.venue]?.short || s.venue} ${s.label}`;
      if (s.url) {
        const a = el("a", "", label); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; row.appendChild(a);
      } else row.appendChild(el("span", "", label));
      if (s.note) row.appendChild(el("span", "note", s.note));
      src.appendChild(row);
    }
    const gen = new Date(DATA.generated_at);
    $("#generated").textContent = `データ取得: ${gen.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST — 毎朝自動更新`;
  }

  // ---------- boot ----------
  loadState();
  load().then(() => {
    renderStatic();
    update();
  }).catch((err) => {
    $("#view").textContent = "データを読み込めませんでした: " + err;
  });
})();
