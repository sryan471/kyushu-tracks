# 九州サーキット走行カレンダー / Kyushu Track Days

HSR九州（熊本）・SPA直入（大分）・オートポリス（大分）の走行スケジュールを一つのページにまとめる非公式サイト。
フリー走行（スポーツ走行）の枠、走行会・イベント、レースを日付ごとに並べて表示します。

## 構成

```
scraper/   Python スクレイパー（requests + BeautifulSoup + pypdf）
  common.py     共通ヘルパー・分類ルール（free / event / race / school / private / closed / open / trial）
  hsr.py        HSR九州: ms-event.net の走行スケジュール（月別 JSON、サーキット / ドリームコース）
  spa.py        SPA直入: オンロード・林道コーススケジュール、年間カレンダー
  autopolis.py  オートポリス: レーシング / レイクサイドコース表、4輪・2輪走行会一覧、年間スケジュール PDF
  build.py      全ソースをまとめて site/data/events.json を出力
site/      静的サイト（ビルド不要）
  index.html, styles.css, app.js, data/events.json
.github/workflows/update.yml  毎朝 06:00 JST にスクレイプして GitHub Pages へデプロイ
```

## ローカルで動かす

```bash
pip install -r scraper/requirements.txt
python scraper/build.py
python -m http.server 8765 --directory site
```

ブラウザで http://localhost:8765 を開く。

## データの取り方（メモ）

| サーキット | ソース | 形式 |
| --- | --- | --- |
| HSR九州 | `www1.ms-event.net/hsrweb/…timesc_list&sel_course=circuit|dream&sel_year=&sel_mon=` | ページ内 `node_json`（枠＝node_type 1、イベント＝node_type 2） |
| HSR九州 | `event_schedule2026.pdf` | 参照リンクのみ（文字座標から月列を復元できず自動解析は断念） |
| SPA直入 | `/spa/member/sports-run/course-schedule/` | 月別テーブル、20分刻み、A / B / MQ / A.B、体験走行○×、講習予約○× |
| SPA直入 | `/spa/member/sports-run/rindoucourse-schedule/` | 林道コース 予約可否 |
| SPA直入 | `/spa/calender/` | 年間カレンダー（イベント・レース） |
| オートポリス | `/ap/member/sports-run/racing-course-schedule/`, `lakeside-course-schedule/` | 月別テーブル、30分刻み、2B / 2S / 4F / 4TN… |
| オートポリス | `/ap/entry/car/`, `/ap/entry/bike/` | 走行会一覧（開催日・名称・主催・コース） |
| オートポリス | 年間スケジュール PDF（トップページから自動検出） | レース日程、公開済みの月は HTML 表を優先 |

年は書かれていないことが多いので、今日を基準に −4〜+7 か月に収まる年を推定しています。

## 注意

公式情報ではありません。走行前に必ず各サーキットの公式サイトで日程・料金・クラス区分を確認してください。
