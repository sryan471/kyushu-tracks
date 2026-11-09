"""Shared helpers for the Kyushu track schedule scrapers."""
from __future__ import annotations

import datetime as dt
import hashlib
import re

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (compatible; KyushuTrackSchedule/0.1)"
JST = dt.timezone(dt.timedelta(hours=9))

VENUES = {
    "hsr": {"name": "HSR九州", "short": "HSR", "pref": "熊本", "url": "https://www.rms.co.jp/kumamoto/hsr/"},
    "spa": {"name": "SPA直入", "short": "SPA", "pref": "大分", "url": "https://autopolis.jp/spa/"},
    "ap": {"name": "オートポリス", "short": "AP", "pref": "大分", "url": "https://autopolis.jp/ap/"},
}

COURSES = {
    ("hsr", "circuit"): "サーキットコース",
    ("hsr", "dream"): "ドリームコース",
    ("spa", "onroad"): "オンロードコース",
    ("spa", "offroad"): "林道コース",
    ("ap", "racing"): "レーシングコース",
    ("ap", "lakeside"): "レイクサイドコース",
}


def today() -> dt.date:
    return dt.datetime.now(JST).date()


def now_iso() -> str:
    return dt.datetime.now(JST).replace(microsecond=0).isoformat()


def fetch(url: str, binary: bool = False, timeout: int = 40):
    r = requests.get(url, headers={"User-Agent": UA}, timeout=timeout)
    r.raise_for_status()
    if binary:
        return r.content
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding
    return r.text


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def clean(s) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("　", " ")).strip()


def infer_year(month: int, ref: dt.date | None = None) -> int:
    """Pick the year that places `month` within -4..+7 months of today."""
    ref = ref or today()
    for y in (ref.year - 1, ref.year, ref.year + 1):
        diff = (y * 12 + month) - (ref.year * 12 + ref.month)
        if -4 <= diff <= 7:
            return y
    return ref.year


def valid_date(y: int, m: int, d: int) -> str | None:
    try:
        return dt.date(y, m, d).isoformat()
    except ValueError:
        return None


# --- classification -------------------------------------------------------

CLOSED_KW = ["定休日", "クローズ", "休業", "メンテナンス", "中止", "コースクリア", "休館", "休園"]
SCHOOL_KW = ["スクール", "SCHOOL", "School", "講習", "レッスン", "ACADEMY", "アカデミー", "Training", "トレーニング", "レクチャー"]
RACE_RE = re.compile(
    r"レース|選手権|カップ|CUP|Cup|耐久|グランプリ|GRAND PRIX|GP\b|SUPER GT|FORMULA|スーパーサンデー|エンデュランス|ENDURANCE|"
    r"ミニバイク祭|予選|決勝|スプリント|Sprint|SPRINT|DRAG|ドラッグ|トライアル|D1|ジムカーナ|Rd\.?\s*\d|Round\s*\d|第\s*\d+\s*戦|"
    r"SAGA CUP|レン耐|League|リーグ|チャレンジカップ|Battle|バトル|大会",
    re.I,
)
BIKE_RE = re.compile(r"2輪|２輪|二輪|バイク|ライディング|Riding|RIDING|モト|ロードレース|Ninja|JSB|ST600|ST1000|JP250|鉄馬|モタード|ONE\s*[&＆]\s*TWO|KAZE|ピレリ|エンジョイ|RSG|SPA直入ライディング|ミニバイク", re.I)
CAR_RE = re.compile(r"4輪|４輪|四輪|クルマ|車|ドリフト|DRIFT|Drift|カー|SUPER GT|FORMULA|86|BRZ|ジムカーナ|GR|VITA|軽|Yaris|ロードスター|REVSPEED|REV SPEED|Driving|DRIVING|D1|TIME ATTACK", re.I)


EVENT_KW = ["走行会", "Track Day", "TRACK DAY", "トラックデイ", "練習会", "ミーティング", "FUN RIDE", "ファントラック",
            "RUNRUN", "ランフェスタ", "走行枠", "試乗会", "ツーリング"]
FREE_KW = ["特別スポーツ走行", "特別走行", "スポーツ走行"]


def classify(title: str) -> str:
    t = title or ""
    if "貸切" in t:
        return "private"
    if any(k in t for k in CLOSED_KW):
        return "closed"
    if any(k in t for k in FREE_KW):
        return "free"
    if any(k in t for k in SCHOOL_KW):
        return "school"
    if any(k in t for k in EVENT_KW):
        return "event"
    if RACE_RE.search(t):
        return "race"
    return "event"


def guess_vehicle(title: str) -> str | None:
    t = title or ""
    b = bool(BIKE_RE.search(t))
    c = bool(CAR_RE.search(t))
    if b and not c:
        return "bike"
    if c and not b:
        return "car"
    return None


def make_event(venue, course, date, title, kind, *, start=None, end=None, date_end=None, cls=None,
               vehicle=None, url=None, note=None, remain=None, price=None, source=None, approx=False):
    title = clean(title)
    key = f"{venue}|{course}|{date}|{start or ''}|{title}|{cls or ''}"
    ev = {
        "id": hashlib.sha1(key.encode("utf-8")).hexdigest()[:12],
        "venue": venue,
        "course": course,
        "date": date,
        "title": title,
        "kind": kind,
    }
    if date_end and date_end != date:
        ev["date_end"] = date_end
    if start:
        ev["start"] = start
    if end:
        ev["end"] = end
    if cls:
        ev["cls"] = cls
    if vehicle:
        ev["vehicle"] = vehicle
    if url:
        ev["url"] = url
    if note:
        ev["note"] = clean(note)
    if remain:
        ev["remain"] = remain
    if price:
        ev["price"] = price
    if source:
        ev["source"] = source
    if approx:
        ev["approx"] = True
    return ev


def merge_spans(spans):
    """Merge adjacent spans with identical (text, href): list of dict(start_idx, end_idx, text, href)."""
    out = []
    for s in spans:
        if out and out[-1]["text"] == s["text"] and out[-1]["href"] == s["href"] and out[-1]["end_idx"] == s["start_idx"]:
            out[-1]["end_idx"] = s["end_idx"]
        else:
            out.append(dict(s))
    return out


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
