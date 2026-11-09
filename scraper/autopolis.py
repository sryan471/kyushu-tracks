"""オートポリス (Autopolis, 大分・日田市).

Sources
- Racing course / Lakeside course monthly HTML tables (30-min columns 08:00-16:30).
- 4輪走行会 / 2輪走行会 listing tables (date, name, organiser, course).
- Annual schedule PDF (races), used for months without a published HTML table.
"""
from __future__ import annotations

import datetime as dt
import io
import re
from urllib.parse import urljoin

from common import (classify, clean, fetch, guess_vehicle, hhmm, infer_year, make_event,
                    merge_spans, soup, valid_date)

RACING_URL = "https://autopolis.jp/ap/member/sports-run/racing-course-schedule/"
LAKESIDE_URL = "https://autopolis.jp/ap/member/sports-run/lakeside-course-schedule/"
CAR_EVENTS_URL = "https://autopolis.jp/ap/entry/car/"
BIKE_EVENTS_URL = "https://autopolis.jp/ap/entry/bike/"
PDF_URL = "https://autopolis.jp/ap/wp-content/uploads/2025/12/2026AUTOPOLISschedule.pdf"
HOME = "https://autopolis.jp/ap/"

CLASS_RE = re.compile(r"^(2B-?A|2B-?B|2B|2S|2ALL|4F|4TN-?A|4TN-?B|4TN|4ALL|KSP)$", re.I)
CLASS_LEGEND = {
    "4F": "4輪 フォーミュラ・VITA",
    "4TN-A": "4輪 ツーリング/ナンバー付 2分30秒より速い",
    "4TN-B": "4輪 ツーリング/ナンバー付 2分30秒より遅い",
    "4TN": "4輪 ツーリング/ナンバー付",
    "4ALL": "4輪 混走（4F+4TN）",
    "KSP": "カート",
    "2B-A": "2輪 401cc以上 2分10秒より速い",
    "2B-B": "2輪 401cc以上 2分10秒より遅い",
    "2B": "2輪 401cc以上",
    "2S": "2輪 400cc以下",
    "2ALL": "2輪 混走（2B+2S）",
    "RS": "ライディングスクール（TMR）",
    "CL": "コースライセンス講習 設定日（10:00〜）",
}
DAY_RE = re.compile(r"(\d{1,2})日")
FIRST_SLOT_MIN = 8 * 60
SLOT_MIN = 30
TIME_COLS = 18  # 08:00 .. 16:30


def _norm_cls(c: str) -> str:
    c = c.upper().replace("－", "-")
    if c in ("4TNA", "4TNB", "2BA", "2BB"):
        c = c[:-1] + "-" + c[-1]
    return c


def _caption_month(caption: str):
    m = re.search(r"(\d{1,2})月", caption)
    if not m:
        return None, None, False
    month = int(m.group(1))
    upd = re.search(r"(\d{4})[./](\d{1,2})[./](\d{1,2})", caption)
    updated = f"{upd.group(1)}-{int(upd.group(2)):02d}-{int(upd.group(3)):02d}" if upd else None
    return month, updated, "調整中" in caption


def _cell_spans(tds):
    spans, idx = [], 0
    for td in tds:
        span = int(td.get("colspan", 1) or 1)
        a = td.find("a")
        spans.append({"start_idx": idx, "end_idx": idx + span, "text": clean(td.get_text(" ")),
                      "href": a.get("href") if a else None})
        idx += span
    return spans


def parse_course_table(html: str, course: str, base_url: str):
    doc = soup(html)
    events, months = [], []
    for table in doc.select("table.schedule"):
        cap = table.find("caption")
        month, updated, pending = _caption_month(clean(cap.get_text(" ")) if cap else "")
        if not month:
            continue
        year = infer_year(month)
        months.append({"year": year, "month": month, "updated": updated, "pending": pending})
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
            tds = tr.find_all("td")
            if not tds:
                continue
            gate = clean(tds[0].get_text())
            for s in merge_spans(_cell_spans(tds[1:])):
                text, href = s["text"], s["href"]
                if not text or text == "-" or text.startswith("※レスト"):
                    continue
                url = urljoin(base_url, href) if href else None
                i0, i1 = s["start_idx"], s["end_idx"]
                timed = i0 < TIME_COLS
                start = hhmm(FIRST_SLOT_MIN + SLOT_MIN * i0) if timed else None
                end = hhmm(FIRST_SLOT_MIN + SLOT_MIN * min(i1, TIME_COLS)) if timed else None
                if i1 - i0 >= TIME_COLS - 2:  # effectively all day
                    start = end = None
                if not timed:  # trailing note columns: PIT予約 / CL 講習日
                    if "CL" in text and "講習" in text:
                        events.append(make_event("ap", course, date, "ライセンス講習 設定日（CL）", "open",
                                                 cls="CL", url="https://autopolis.jp/ap/member/introduction/#license",
                                                 source="autopolis.jp"))
                    continue
                if text.startswith("定休日"):
                    events.append(make_event("ap", course, date, "定休日", "closed", source="autopolis.jp"))
                    continue
                if text.startswith("貸切"):
                    events.append(make_event("ap", course, date, text, "private", start=start, end=end,
                                             source="autopolis.jp"))
                    continue
                if text.startswith("体験"):
                    events.append(make_event("ap", course, date, "体験走行", "trial", start=start, end=end,
                                             url=url or urljoin(HOME, "entry/trial-run/"), source="autopolis.jp"))
                    continue
                if text.startswith("予約受付中"):
                    events.append(make_event("ap", course, date, "貸切予約 受付中（7日前まで）", "open",
                                             start=start, end=end, url=url, source="autopolis.jp"))
                    continue
                if CLASS_RE.match(text):
                    cls = _norm_cls(text)
                    vehicle = "car" if cls.startswith("4") else "kart" if cls == "KSP" else "bike"
                    events.append(make_event("ap", course, date, cls, "free", start=start, end=end, cls=cls,
                                             vehicle=vehicle, source="autopolis.jp"))
                    continue
                if text == "RS":
                    events.append(make_event("ap", course, date, "ライディングスクール（RS）", "school", start=start,
                                             end=end, cls="RS", vehicle="bike", url=url, source="autopolis.jp"))
                    continue
                kind = classify(text)
                if kind == "closed":
                    start = end = None
                note = f"ゲートオープン {gate}" if gate and gate != "close" else None
                events.append(make_event("ap", course, date, text, kind, start=start, end=end,
                                         vehicle=guess_vehicle(text), url=url, note=note, source="autopolis.jp"))
    return events, months


def parse_event_list(html: str, base_url: str, default_vehicle: str):
    doc = soup(html)
    events = []
    for tr in doc.select("table tr"):
        th = tr.find("th", scope="row")
        tds = tr.find_all("td")
        if not th or len(tds) < 3:
            continue
        m = re.search(r"(\d{1,2})月\s*(\d{1,2})日", clean(th.get_text()))
        if not m:
            continue
        month, day = int(m.group(1)), int(m.group(2))
        date = valid_date(infer_year(month), month, day)
        if not date:
            continue
        a = tds[0].find("a")
        title = clean(tds[0].get_text(" "))
        organiser = clean(tds[1].get_text(" "))
        course_txt = clean(tds[2].get_text(" "))
        course = "lakeside" if "レイクサイド" in course_txt else "racing"
        url = urljoin(base_url, a["href"]) if a and a.get("href") else None
        note = None if not organiser or organiser == "-" else f"主催: {organiser}"
        kind = classify(title)
        if kind in ("closed", "private"):
            kind = "event"
        events.append(make_event("ap", course, date, title, kind, vehicle=guess_vehicle(title) or default_vehicle,
                                 url=url, note=note, source="autopolis.jp/entry"))
    return events


# --- annual PDF -----------------------------------------------------------

# The PDF uses CJK radical code points (U+2Fxx) for some kanji; map them back.
CJK_FIX = str.maketrans({"⽇": "日", "⽉": "月", "⽕": "火", "⽔": "水", "⽊": "木",
                         "⾦": "金", "⼟": "土", "⾛": "走", "⾏": "行", "⼤": "大",
                         "⼿": "手", "⼊": "入", "⽳": "立"})
WD_CHARS = "日月火水木金土祝"
LAKE_MARK = "㋩"  # ㋹ = held on the lakeside course


def _despace(s: str) -> str:
    s = s.replace(" ", " ").replace("　", " ")
    s = re.sub(r" {2,}", "\x00", s)
    s = s.replace(" ", "")
    return clean(s.replace("\x00", " ")).translate(CJK_FIX)


def _plus_days(iso: str, n: int) -> str:
    return (dt.date.fromisoformat(iso) + dt.timedelta(days=n)).isoformat()


def parse_annual_pdf(data: bytes, pdf_url: str = PDF_URL):
    try:
        import pypdf
    except ImportError:
        return []
    reader = pypdf.PdfReader(io.BytesIO(data))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    lines = [l for l in (_despace(l) for l in text.split("\n")) if l]
    ym = re.search(r"(20\d\d)\s*AUTOPOLIS", "\n".join(lines))
    year = int(ym.group(1)) if ym else infer_year(1)
    events, month, cur = [], None, None
    for line in lines:
        m = re.fullmatch(r"(1[0-2]|[1-9])", line)
        if m:
            month = int(m.group(1))
            cur = None
            continue
        m = re.fullmatch(r"(1[0-2])(\d{1,2})日(.*)", line)
        if m and month and int(m.group(1)) == month + 1:  # "12" and "20日..." glued together
            month = int(m.group(1))
            line = f"{m.group(2)}日{m.group(3)}"
        m = re.match(rf"^(\d{{1,2}})\s*([{WD_CHARS}])\s*(.*)$", line)
        if m and month:
            day, rest = int(m.group(1)), clean(m.group(3))
            date = valid_date(year, month, day)
            if not date:
                continue
            if not rest:
                if cur is not None and cur["date"] <= date <= _plus_days(cur["date"], 3):
                    cur["date_end"] = date  # continuation day (e.g. 25土 / 26日)
                    continue
                cur = {"date": date, "title": None, "details": [], "course": "racing"}
                events.append(cur)
                continue
            cur = {"date": date, "title": rest, "details": [], "course": "racing"}
            events.append(cur)
            continue
        if not month:
            continue
        if cur is not None and cur["title"] is None and not re.match(r"^(開催|併催|その他)", line):
            cur["title"] = line
            continue
        if re.match(r"^(開催レース|開催クラス|併催レース|併催イベント)", line) and cur is not None:
            cur["details"].append(line)
            continue
        if line.startswith("その他"):
            body = line[len("その他"):].lstrip("：: ")
            for part in re.split(r"\s*/\s*", body):
                mm = re.match(rf"^(?:\d{{1,2}}/)?(\d{{1,2}})\(([{WD_CHARS}])\)(?:午後)?"
                              rf"(?:〜(?:\d{{1,2}}/)?(\d{{1,2}})\(([{WD_CHARS}])\))?\s*({LAKE_MARK})?\s*[：:]\s*(.+)$", part)
                if not mm:
                    continue
                d1, _, d2, _, lake, title = mm.groups()
                date = valid_date(year, month, int(d1))
                if not date:
                    continue
                e = {"date": date, "title": clean(title), "details": [], "course": "lakeside" if lake else "racing"}
                if d2:
                    de = valid_date(year, month, int(d2))
                    if de:
                        e["date_end"] = de
                events.append(e)
    out = []
    for e in events:
        if not e.get("title"):
            continue
        title = e["title"].replace(LAKE_MARK, "").strip()
        kind = classify(title)
        if kind in ("closed", "private"):
            kind = "event"
        out.append(make_event("ap", e["course"], e["date"], title, kind, date_end=e.get("date_end"),
                              vehicle=guess_vehicle(title), note=" / ".join(e["details"]) or None,
                              url=pdf_url, source="pdf", approx=True))
    return out


def scrape(status: list):
    events = []
    published = set()
    for course, url in (("racing", RACING_URL), ("lakeside", LAKESIDE_URL)):
        try:
            evs, months = parse_course_table(fetch(url), course, url)
            for mo in months:
                if not mo["pending"]:
                    published.add((course, mo["year"], mo["month"]))
            note = "、".join(
                f"{m['month']}月" + ("(調整中)" if m["pending"] else f"({m['updated']}更新)" if m["updated"] else "")
                for m in months)
            status.append({"venue": "ap", "course": course, "label": "コーススケジュール", "url": url, "ok": True,
                           "count": len(evs), "note": note})
            events.extend(evs)
        except Exception as e:  # noqa: BLE001
            status.append({"venue": "ap", "course": course, "label": "コーススケジュール", "url": url, "ok": False,
                           "count": 0, "note": str(e)[:200]})
    for url, veh, label in ((CAR_EVENTS_URL, "car", "4輪走行会一覧"), (BIKE_EVENTS_URL, "bike", "2輪走行会一覧")):
        try:
            evs = parse_event_list(fetch(url), url, veh)
            status.append({"venue": "ap", "course": "all", "label": label, "url": url, "ok": True,
                           "count": len(evs), "note": None})
            events.extend(evs)
        except Exception as e:  # noqa: BLE001
            status.append({"venue": "ap", "course": "all", "label": label, "url": url, "ok": False,
                           "count": 0, "note": str(e)[:200]})
    pdf_url = PDF_URL
    try:
        home = fetch(HOME)
        found = re.findall(r'href="(https?://autopolis\.jp/ap/wp-content/uploads/[^"]*schedule[^"]*\.pdf)"', home, re.I)
        if found:
            pdf_url = found[0]
    except Exception:  # noqa: BLE001
        pass
    try:
        evs = parse_annual_pdf(fetch(pdf_url, binary=True), pdf_url)
        kept = [e for e in evs if (e["course"], int(e["date"][:4]), int(e["date"][5:7])) not in published]
        status.append({"venue": "ap", "course": "all", "label": "年間スケジュール (PDF)", "url": pdf_url, "ok": True,
                       "count": len(kept), "note": f"PDFから{len(evs)}件抽出、未公開月の{len(kept)}件を採用"})
        events.extend(kept)
    except Exception as e:  # noqa: BLE001
        status.append({"venue": "ap", "course": "all", "label": "年間スケジュール (PDF)", "url": pdf_url, "ok": False,
                       "count": 0, "note": str(e)[:200]})
    return events
