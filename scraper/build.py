"""Scrape all three Kyushu circuits and write site/data/events.json.

Usage: python scraper/build.py [--out site/data/events.json]
Failed sources keep their previous events from the existing output file.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import autopolis  # noqa: E402
import hsr  # noqa: E402
import spa  # noqa: E402
from common import COURSES, VENUES, now_iso, today  # noqa: E402

KIND_LABELS = {
    "free": "フリー走行",
    "event": "イベント・走行会",
    "race": "レース",
    "school": "スクール・講習",
    "trial": "体験走行",
    "private": "貸切",
    "open": "予約可",
    "closed": "休業・クローズ",
}


def dedupe(events):
    seen, out = set(), []
    for e in events:
        key = (e["venue"], e["course"], e["date"], e.get("start"), e["title"], e.get("cls"))
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _norm(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKC", s or "").lower() if ch.isalnum())


def drop_listing_duplicates(events):
    """Autopolis lists track days both in its course table (with times) and in a plain
    走行会一覧. Drop the listing entry when the table already shows the same event that day."""
    tables = {}
    for e in events:
        if e["venue"] == "ap" and e.get("source") == "autopolis.jp" and e["kind"] in ("event", "race", "school"):
            tables.setdefault(e["date"], []).append(_norm(e["title"]))
    out = []
    for e in events:
        if e.get("source") == "autopolis.jp/entry":
            t = _norm(e["title"])
            org = _norm((e.get("note") or "").replace("主催:", ""))
            same_day = tables.get(e["date"], [])
            if any((t and t in x) or (x and x in t) or (len(org) > 2 and org in x) for x in same_day):
                continue
        out.append(e)
    return out


def drop_duplicate_titles(events):
    """When a monthly schedule and an annual list both carry the same event on the same day,
    keep the one with more detail (time or url) and drop the other."""
    by_key = {}
    for e in events:
        if e["kind"] not in ("race", "event", "school"):
            by_key[("keep", e["id"])] = ((9,), e)
            continue
        norm = "".join(ch for ch in unicodedata.normalize("NFKC", e["title"]).lower() if ch.isalnum())[:24]
        key = (e["venue"], e["date"], norm)
        cur = by_key.get(key)
        score = (0 if e.get("approx") else 1, 1 if e.get("start") else 0, 1 if e.get("url") else 0, len(e.get("note") or ""))
        if cur is None or score > cur[0]:
            by_key[key] = (score, e)
    kept_ids = {v[1]["id"] for v in by_key.values()}
    return [e for e in events if e["id"] in kept_ids]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "data", "events.json"))
    args = ap.parse_args()
    out_path = os.path.abspath(args.out)

    previous = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as f:
                previous = json.load(f)
        except Exception:  # noqa: BLE001
            previous = {}

    status, events = [], []
    for mod in (hsr, spa, autopolis):
        try:
            events.extend(mod.scrape(status))
        except Exception as e:  # noqa: BLE001
            status.append({"venue": mod.__name__, "course": "all", "label": "scrape()", "url": None, "ok": False, "count": 0, "note": str(e)[:200]})

    # fall back to previous data for venues whose every source failed
    for venue in VENUES:
        st = [s for s in status if s["venue"] == venue]
        if st and not any(s["ok"] for s in st):
            old = [e for e in previous.get("events", []) if e["venue"] == venue]
            events.extend(old)
            status.append({"venue": venue, "course": "all", "label": "前回データを使用", "url": None, "ok": False,
                           "count": len(old), "note": "全ソース取得失敗のため前回分を保持"})

    events = drop_duplicate_titles(drop_listing_duplicates(dedupe(events)))
    events.sort(key=lambda e: (e["date"], e.get("start") or "", e["venue"], e["title"]))

    data = {
        "generated_at": now_iso(),
        "today": today().isoformat(),
        "venues": VENUES,
        "courses": {f"{v}:{c}": n for (v, c), n in COURSES.items()},
        "kinds": KIND_LABELS,
        "legend": {"hsr": hsr.CLASS_LEGEND, "spa": spa.CLASS_LEGEND, "ap": autopolis.CLASS_LEGEND},
        "sources": status,
        "events": events,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    ok = sum(1 for s in status if s["ok"])
    print(f"wrote {out_path}: {len(events)} events, {ok}/{len(status)} sources ok")
    for s in status:
        flag = "OK " if s["ok"] else "ERR"
        print(f"  {flag} {s['venue']:3} {s['course']:8} {s['label']:28} {s['count']:4}  {s.get('note') or ''}")


if __name__ == "__main__":
    main()
