#!/usr/bin/env python3
"""
توليد تخطيط مصحف المدينة (١٥ سطراً، طبعة ١٤٠٥هـ — V1) لكل صفحة من الـ ٦٠٤.

المصدر: واجهة Quran.com (api.quran.com/api/v4) — لكل كلمة:
  - line_v1 / v1_page: رقم السطر والصفحة في طبعة المدينة V1.
  - text_qpc_hafs: رسم مجمع الملك فهد (KFGQPC Hafs) المطابق لخط الحفص العثماني.

لماذا V1: تقسيم الصفحات فيها يطابق بيانات Tanzil المستعملة في بقية التطبيق
(PAGE_STARTS، الختمة، العلامات). السكربت يتحقق من ذلك آية آية ويتوقف عند أي اختلاف.

الأسطر الخالية من الكلمات هي رؤوس السور والبسملة. تُنسب إلى السورة التالية
بالرجوع للخلف من سطر آيتها الأولى: البسملة أولاً (عدا الفاتحة والتوبة) ثم اسم
السورة — وقد يقع اسم السورة في السطر ١٥ من الصفحة السابقة كما في المطبوع.

الاستعمال:
  python3 scripts/build-mushaf15.py            # يجلب (مع تخزين مؤقت) ثم يولّد
  MUSHAF15_CACHE=/tmp/m15 python3 scripts/build-mushaf15.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "quran" / "mushaf15"
TANZIL = ROOT / "public" / "data" / "quran" / "uthmani"
CACHE = Path(os.environ.get("MUSHAF15_CACHE", "/tmp/manar-mushaf15-raw"))
PAGES = 604
API = (
    "https://api.quran.com/api/v4/verses/by_page/{page}"
    "?words=true&word_fields=text_qpc_hafs,line_v1,v1_page&per_page=all"
)


def fetch(page: int) -> list:
    """[{k: "2:6", w: [[line, type, text, page], ...]}, ...] لصفحة واحدة."""
    cached = CACHE / f"{page}.json"
    if cached.exists():
        return json.loads(cached.read_text("utf8"))
    req = urllib.request.Request(
        API.format(page=page), headers={"User-Agent": "manar-build/1.0", "Accept": "application/json"}
    )
    last: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                data = json.load(res)
            break
        except Exception as e:  # noqa: BLE001 — إعادة المحاولة لأي خطأ شبكة
            last = e
            time.sleep(2 * (attempt + 1))
    else:
        raise RuntimeError(f"تعذّر جلب الصفحة {page}: {last}")
    out = [
        {
            "k": v["verse_key"],
            "w": [[w["line_v1"], w["char_type_name"], w["text_qpc_hafs"], w["v1_page"]] for w in v["words"]],
        }
        for v in data["verses"]
    ]
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(out, ensure_ascii=False), "utf8")
    return out


def lines_on(page: int) -> int:
    # الصفحتان الأولى والثانية مزخرفتان بثمانية أسطر.
    return 8 if page <= 2 else 15


def main() -> int:
    with ThreadPoolExecutor(4) as ex:
        raw = dict(zip(range(1, PAGES + 1), ex.map(fetch, range(1, PAGES + 1))))

    # صفحة كل آية في بيانات Tanzil المضمّنة.
    tanzil_page: dict[tuple[int, int], int] = {}
    for s in range(1, 115):
        for a in json.loads((TANZIL / f"{s}.json").read_text("utf8"))["ayahs"]:
            tanzil_page[(s, a["n"])] = a["p"]

    # grid[page][line] = {"s": surah, "w": [...]} أو None (رأس/بسملة).
    grid: dict[int, dict[int, dict | None]] = {}
    first_line: dict[int, tuple[int, int]] = {}
    seen = 0
    for page in range(1, PAGES + 1):
        rows: dict[int, dict | None] = {n: None for n in range(1, lines_on(page) + 1)}
        for v in raw[page]:
            s, a = map(int, v["k"].split(":"))
            seen += 1
            if tanzil_page[(s, a)] != page:
                print(f"اختلاف صفحة: {s}:{a} Tanzil={tanzil_page[(s, a)]} V1={page}", file=sys.stderr)
                return 1
            for line, kind, text, wpage in v["w"]:
                if wpage != page or not 1 <= line <= lines_on(page):
                    print(f"كلمة خارج الصفحة: {s}:{a} ص{wpage} س{line}", file=sys.stderr)
                    return 1
                row = rows[line]
                if row is None:
                    row = rows[line] = {"s": s, "w": []}
                elif row["s"] != s:
                    print(f"سطر يجمع سورتين: ص{page} س{line}", file=sys.stderr)
                    return 1
                # الكلمة: [آية، نص]. علامة نهاية الآية: [آية].
                row["w"].append([a] if kind == "end" else [a, text])
                if a == 1 and s not in first_line:
                    first_line[s] = (page, line)
        grid[page] = rows

    if seen != 6236 or len(first_line) != 114:
        print(f"عدد غير متوقع: آيات={seen} سور={len(first_line)}", file=sys.stderr)
        return 1

    # نسبة الأسطر الخالية: بسملة ثم اسم السورة، بالرجوع للخلف (وقد تعبر إلى الصفحة السابقة).
    def prev_slot(page: int, line: int) -> tuple[int, int] | None:
        if line > 1:
            return page, line - 1
        if page > 1:
            return page - 1, lines_on(page - 1)
        return None

    for s in range(1, 115):
        need = ["h"] if s in (1, 9) else ["h", "b"]
        slot = prev_slot(*first_line[s])
        for kind in reversed(need):
            if slot is None or grid[slot[0]][slot[1]] is not None:
                print(f"لا مكان لـ{kind} السورة {s}", file=sys.stderr)
                return 1
            grid[slot[0]][slot[1]] = {"t": kind, "s": s}
            slot = prev_slot(*slot)

    OUT.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    for page in range(1, PAGES + 1):
        lines = []
        for n in range(1, lines_on(page) + 1):
            row = grid[page][n]
            if row is None:
                print(f"سطر فارغ غير منسوب: ص{page} س{n}", file=sys.stderr)
                return 1
            lines.append(row)
        body = json.dumps({"p": page, "l": lines}, ensure_ascii=False, separators=(",", ":"))
        (OUT / f"{page}.json").write_text(body, "utf8")
        total_bytes += len(body.encode("utf8"))

    print(f"تم: {PAGES} صفحة، {seen} آية، {total_bytes / 1024 / 1024:.2f} م.ب")
    return 0


if __name__ == "__main__":
    sys.exit(main())
