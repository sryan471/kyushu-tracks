"""HSR九州 (Honda Safety & Riding Plaza Kyushu, 熊本・大津町).

Sources
- Monthly slot schedule: ms-event.net embeds a `node_json` object per course/month.
  node_type 1 = bookable sports-run slot (category label = class), node_type 2 = event/booking.
- Annual event PDF (best effort, coordinates -> month columns), used only for months
  the monthly schedule has not published yet.
"""
from __future__ import annotations

import datetime as dt
import json
import re

from common import classify, clean, fetch, guess_vehicle, make_event, today

SCHEDULE_URL = ("https://www1.ms-event.net/hsrweb/user/?a=timesc.timesc_list"
                "&sel_course={course}&sel_year={y}&sel_mon={m}")
PDF_URL = "https://www.rms.co.jp/kumamoto/hsr/pdf/event_schedule{year}.pdf"
PUBLIC_SCHEDULE_URL = "https://www.ms-event.net/hsrweb/user/?a=timesc.timesc_list&sel_course={course}"

CLASS_VEHICLE = {
    "S1": "bike", "S2": "bike", "S3": "bike", "F": "bike",
    "4": "car", "4D": "car", "K": "kart", "R": None,
}

CLASS_LEGEND = {
    "S1": "2輪 S1（QMSCライセンス・125cc以上）",
    "S2": "2輪 S2（QMSCライセンス・125cc以上）",
    "S3": "2輪 S3（QMSCライセンス・125cc以上）",
    "F": "ミニバイク F（Sドリームライセンス・4st125cc未満/2st80cc未満）",
    "4": "4輪 スポーツ走行（4Rライセンス・25分）",
    "4D": "4輪 D枠（公式表で要確認）",
    "K": "K枠（公式表で要確認）",
    "R": "R枠（公式表で要確認）",
}



def _months(n: int = 4):
    d = today().replace(day=1)
    out = []
    for _ in range(n):
        out.append((d.year, d.month))
        d = (d + dt.timedelta(days=32)).replace(day=1)
    return out


def parse_month(html: str, course: str):
    m = re.search(r"var node_json = (\{.*?\});", html, re.S)
    if not m:
        return []
    nodes = json.loads(m.group(1))
    events = []
    for v in nodes.values():
        if v.get("public_stat") != "1" or v.get("del_flg") == "1":
            continue
        date = v["start_date"][:10]
        date_end = (v.get("end_date") or "")[:10] or None
        start, end = v.get("start"), v.get("end")
        if v.get("node_type") == "1":
            cls = clean(v.get("cate_label") or "")
            vehicle = "bike" if course == "dream" else CLASS_VEHICLE.get(cls)
            if course == "dream":
                # Dream course sells 1日/半日 tickets; the grid positions are not real session times.
                start = end = None
            remain = v.get("remain_label")
            mp = str(v.get("m_price") or "0")
            price = int(mp) if mp.isdigit() and int(mp) else None
            events.append(make_event("hsr", course, date, cls, "free", start=start, end=end, cls=cls,
                                     vehicle=vehicle, remain=remain, price=price, source="ms-event"))
        else:
            title = clean(v.get("subject") or "")
            if not title:
                continue
            kind = classify(title)
            if title == "貸切" or title.endswith("様"):
                kind = "private"
                if title != "貸切":
                    title = f"貸切（{title}）"
            vehicle = guess_vehicle(title)
            if course == "dream" and vehicle is None and kind in ("race", "event"):
                vehicle = "bike"
            link = v.get("link") or None
            # all-day bookings use 09:00-17:00; drop the times when it is just the default full day
            if start == "09:00" and end == "17:00" and date_end == date:
                start = end = None
            events.append(make_event("hsr", course, date, title, kind, start=start, end=end,
                                     date_end=date_end, vehicle=vehicle, url=link, source="ms-event"))
    return events


def scrape(status: list):
    events = []
    published = set()
    for course in ("circuit", "dream"):
        for y, m in _months(4):
            url = SCHEDULE_URL.format(course=course, y=y, m=m)
            label = f"{y}年{m}月 走行スケジュール"
            try:
                evs = parse_month(fetch(url), course)
                if evs:
                    published.add((course, y, m))
                status.append({"venue": "hsr", "course": course, "label": label,
                               "url": PUBLIC_SCHEDULE_URL.format(course=course), "ok": True,
                               "count": len(evs), "note": None if evs else "未公開"})
                events.extend(evs)
            except Exception as e:  # noqa: BLE001
                status.append({"venue": "hsr", "course": course, "label": label, "url": url, "ok": False,
                               "count": 0, "note": str(e)[:200]})
    # The annual event PDF is a graphic table whose month columns cannot be recovered reliably
    # from the text layer, so it is linked as a reference instead of being parsed.
    year = today().year
    status.append({"venue": "hsr", "course": "all", "label": f"イベントスケジュール{year} (PDF)",
                   "url": PDF_URL.format(year=year), "ok": True, "count": 0, "note": "参照リンクのみ（自動解析なし）"})
    return events
