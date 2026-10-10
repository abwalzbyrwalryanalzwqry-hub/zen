#!/usr/bin/env python3
"""يولّد src/lib/quran/surah-maqasid.ts: «من مقاصد السورة» للسور الـ١١٤.

المصدر: «المختصر في التفسير» (مركز تفسير للدراسات القرآنية) كما تنشره
موسوعة القرآن الكريم QuranEnc في صفحة كل سورة. يُنقل النص كما هو دون تعديل.

الاستعمال: python3 scripts/build-surah-maqasid.py
(يقرأ الصفحات المخزّنة في MAQASID_CACHE إن وُجدت، وإلا يجلبها.)
"""

import html
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "lib" / "quran" / "surah-maqasid.ts"
CACHE = Path(os.environ.get("MAQASID_CACHE", "/tmp/maq"))
URL = "https://quranenc.com/ar/browse/arabic_mokhtasar/{}"
MARK = "من مقاصد السورة"


def page(n: int) -> str:
    f = CACHE / f"{n}.html"
    if f.exists():
        return f.read_text("utf8")
    with urllib.request.urlopen(URL.format(n), timeout=60) as r:
        body = r.read().decode("utf8")
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(body, "utf8")
    return body


def extract(body: str) -> str:
    i = body.find(MARK)
    if i < 0:
        raise ValueError("لم يُعثر على «من مقاصد السورة»")
    parts = [t.strip() for t in re.sub(r"<[^>]+>", "\n", body[i : i + 3000]).split("\n")]
    parts = [p for p in parts if p]
    return html.unescape(parts[1])


def main() -> None:
    items = []
    for n in range(1, 115):
        text = extract(page(n))
        if len(text) < 10 or "<" in text:
            sys.exit(f"نص غير متوقع للسورة {n}: {text!r}")
        items.append(text)
    lines = ",\n".join(f"  {json.dumps(t, ensure_ascii=False)}" for t in items)
    OUT.write_text(
        "// مولَّد آلياً بواسطة scripts/build-surah-maqasid.py — لا تعدّله يدوياً.\n"
        "// «من مقاصد السورة» من «المختصر في التفسير» (مركز تفسير للدراسات القرآنية)،\n"
        "// عبر موسوعة القرآن الكريم QuranEnc، منقولاً كما هو.\n\n"
        'export const MAQASID_SOURCE = {\n  nameAr: "المختصر في التفسير",\n'
        '  authorAr: "مركز تفسير للدراسات القرآنية",\n'
        '  url: "https://quranenc.com/ar/browse/arabic_mokhtasar",\n} as const;\n\n'
        "/** «من مقاصد السورة» بالترتيب (الفهرس = رقم السورة - ١). */\n"
        f"export const SURAH_MAQASID: readonly string[] = [\n{lines},\n];\n\n"
        "export function surahMaqasid(surah: number): string | undefined {\n"
        "  return SURAH_MAQASID[surah - 1];\n}\n",
        "utf8",
    )
    print(f"كُتب {OUT.relative_to(ROOT)} ({len(items)} سورة)")


if __name__ == "__main__":
    main()
