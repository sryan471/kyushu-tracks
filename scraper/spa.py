"""SPA直入 (Speed Park Naoiri, 大分・竹田市).

Sources
- On-road course schedule: monthly HTML tables, 20-min columns 09:00-11:40 / 13:00-16:40,
  plus 体験走行 and 講習予約 availability columns.
- 林道 (off-road) course schedule: one row per day (予約できます / 定休日 / ×).
- 年間カレンダー: annual list of events/races (date, 2輪/4輪 icon, title, organiser).
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from common import (classify, clean, fetch, guess_vehicle, hhmm, infer_year, make_event,
                    merge_spans, soup, valid_date)

ONROAD_URL = "https://autopolis.jp/spa/member/sports-run/course-schedule/"
OFFROAD_URL = "https://autopolis.jp/spa/member/sports-run/rindoucourse-schedule/"
CALENDAR_URL = "https://autopolis.jp/spa/calender/"

CLASS_LEGEND = {
    "A": "2輪 Aクラス（251cc以上・40秒台〜52秒）",
    "B": "2輪 Bクラス（251cc以上・53秒以上）",
    "A.B": "2輪 A/B混走",
    "MQ": "ミニバイク＆4st250cc以下（タイム制限なし）",
}
CLASS_RE = re.compile(r"^(A|B|A\.B|A/B|MQ)$")
DAY_RE = re.compile(r"(\d{1,2})日")
# column index -> start minute. 0-8: 09:00.. (20 min), 9: 体験走行, 10-21: 13:00.., 22: 講習予約
AM = [9 * 60 + 20 * i for i in range(9)]
PM = [13 * 60 + 20 * i for i in range(12)]
TRIAL_COL, LESSON_COL = 9, 22
CIRCLE = "○"  # ○


def _col_time(idx: int):
    if idx < 9:
        return AM[idx]
    if 10 <= idx < 22:
        return PM[idx - 10]
    return None


def _caption_month(caption: str):
    m = re.search(r"(?:(\d{4})年)?\s*(\d{1,2})月", caption)
    if not m:
        return None, None, None
    year = int(m.group(1)) if m.group(1) else None
    month = int(m.group(2))
    upd = re.search(r"(\d{1,2})月(\d{1,2})日更新", caption)
    return year, month, (f"{int(upd.group(1))}/{int(upd.group(2))}" if upd else None)


def _spans(tds):
    spans, idx = [], 0
    for td in tds:
        span = int(td.get("colspan", 1) or 1)
        a = td.find("a")
        spans.append({"start_idx": idx, "end_idx": idx + span, "text": clean(td.get_text(" ")),
                      "href": a.get("href") if a else None})
        idx += span
    return merge_spans(spans)


def parse_onroad(html: str):
    doc = soup(html)
    events, months = [], []
    for table in doc.select("table.schedule"):
        cap = table.find("caption")
        cy, month, updated = _caption_month(clean(cap.get_text(" ")) if cap else "")
        if not month:
            continue
        year = cy or infer_year(month)
        months.append({"year": year, "month": month, "updated": updated})
        for tr in table.find_all("tr"):
            th = tr.find("th", scope="row")
            if not th:
                continue
            dm = DAY_RE.search(clean(th.get_text()))
            if not dm:
                continue
            date = valid_date(year, month, int(dm.group(1)))
            if not date:
                continue
            for s in _spans(tr.find_all("td")):
                text, i0, i1 = s["text"], s["start_idx"], s["end_idx"]
                url = urljoin(ONROAD_URL, s["href"]) if s["href"] else None
                if not text or text == "-":
                    continue
                if i0 == LESSON_COL:
                    if text == CIRCLE:
                        events.append(make_event("spa", "onroad", date, "ライセンス講習 予約可", "open",
                                                 url="https://autopolis.jp/spa/member/introduction/",
                                                 source="autopolis.jp/spa"))
                    continue
                if i0 == TRIAL_COL and i1 == TRIAL_COL + 1:
                    if text == CIRCLE:
                        events.append(make_event("spa", "onroad", date, "体験走行 可", "trial",
                                                 url="https://autopolis.jp/spa/entry/trial-run/",
                                                 source="autopolis.jp/spa"))
                    continue
                allday = (i1 - i0) >= 20
                t0, t1 = _col_time(i0), _col_time(i1 - 1)
                start = hhmm(t0) if (t0 is not None and not allday) else None
                end = hhmm(t1 + 20) if (t1 is not None and not allday) else None
                if text == "定休日":
                    events.append(make_event("spa", "onroad", date, "定休日", "closed", source="autopolis.jp/spa"))
                    continue
                if CLASS_RE.match(text):
                    cls = text.replace("/", ".")
                    events.append(make_event("spa", "onroad", date, cls, "free", start=start, end=end, cls=cls,
                                             vehicle="bike", source="autopolis.jp/spa"))
                    continue
                kind = classify(text)
                if kind == "closed":
                    start = end = None
                events.append(make_event("spa", "onroad", date, text, kind, start=start, end=end,
                                         vehicle=guess_vehicle(text), url=url, source="autopolis.jp/spa"))
    return events, months


def parse_offroad(html: str):
    doc = soup(html)
    events, months = [], []
    for table in doc.select("table.schedule"):
        cap = table.find("caption")
        cy, month, updated = _caption_month(clean(cap.get_text(" ")) if cap else "")
        if not month:
            continue
        year = cy or infer_year(month)
        months.append({"year": year, "month": month, "updated": updated})
        hours = None
        for tr in table.find_all("tr"):
            th = tr.find("th", scope="row")
            td = tr.find("td")
            if not th or not td:
                continue
            label = clean(th.get_text())
            text = clean(td.get_text(" "))
            if label.startswith("走行時間"):
                hours = text
                continue
            dm = DAY_RE.search(label)
            if not dm:
                continue
            date = valid_date(year, month, int(dm.group(1)))
            if not date:
                continue
            if text.startswith("予約できます"):
                events.append(make_event("spa", "offroad", date, "林道コース 予約可", "open", note=hours,
                                         url="https://autopolis.jp/spa/member/offroad/", source="autopolis.jp/spa"))
            elif text == "定休日":
                events.append(make_event("spa", "offroad", date, "定休日", "closed", source="autopolis.jp/spa"))
            elif text in ("×", "x", "X", "-"):
                continue
            else:
                events.append(make_event("spa", "offroad", date, text, classify(text), source="autopolis.jp/spa"))
    return events, months


def parse_calendar(html: str):
    doc = soup(html)
    main = doc.find("main") or doc
    events, year, month = [], None, None
    for el in main.find_all(["h2", "h3", "table"]):
        if el.name == "h2":
            m = re.search(r"(\d{4})年", el.get_text())
            year = int(m.group(1)) if m else year
        elif el.name == "h3":
            m = re.search(r"(\d{1,2})月", el.get_text())
            month = int(m.group(1)) if m else month
        elif el.name == "table" and year and month:
            for tr in el.find_all("tr"):
                th = tr.find("th")
                if not th:
                    continue
                dm = DAY_RE.search(clean(th.get_text()))
                if not dm:
                    continue
                date = valid_date(year, month, int(dm.group(1)))
                if not date:
                    continue
                img = tr.select_one("td.category img")
                alt = img.get("alt", "") if img else ""
                vehicle = "bike" if "2" in alt else "car" if "4" in alt else None
                tt = tr.select_one("td.title")
                a = tt.find("a") if tt else None
                title = clean(tt.get_text(" ")) if tt else ""
                if not title:
                    continue
                org_el = tr.select_one("td.organizer")
                org = clean(org_el.get_text(" ")) if org_el else ""
                url = urljoin(CALENDAR_URL, a["href"]) if a and a.get("href") else None
                kind = classify(title)
                if kind in ("closed", "private"):
                    kind = "event"
                note = org if org and org != "SPA主催" else None
                events.append(make_event("spa", "onroad", date, title, kind, vehicle=vehicle or guess_vehicle(title),
                                         url=url, note=note, source="autopolis.jp/spa/calender"))
    return events


def scrape(status: list):
    events = []
    for url, fn, course, label in ((ONROAD_URL, parse_onroad, "onroad", "オンロードコーススケジュール"),
                                   (OFFROAD_URL, parse_offroad, "offroad", "林道コーススケジュール")):
        try:
            evs, months = fn(fetch(url))
            note = "、".join(f"{m['month']}月" + (f"({m['updated']}更新)" if m["updated"] else "") for m in months)
            status.append({"venue": "spa", "course": course, "label": label, "url": url, "ok": True,
                           "count": len(evs), "note": note})
            events.extend(evs)
        except Exception as e:  # noqa: BLE001
            status.append({"venue": "spa", "course": course, "label": label, "url": url, "ok": False,
                           "count": 0, "note": str(e)[:200]})
    try:
        evs = parse_calendar(fetch(CALENDAR_URL))
        status.append({"venue": "spa", "course": "onroad", "label": "年間カレンダー", "url": CALENDAR_URL, "ok": True,
                       "count": len(evs), "note": None})
        events.extend(evs)
    except Exception as e:  # noqa: BLE001
        status.append({"venue": "spa", "course": "onroad", "label": "年間カレンダー", "url": CALENDAR_URL, "ok": False,
                       "count": 0, "note": str(e)[:200]})
    return events
