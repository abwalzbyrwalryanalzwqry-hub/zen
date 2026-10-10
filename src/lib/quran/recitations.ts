// ============================================================
// Zen — Quran Module
// Recitations: reciter catalogue, audio URLs, playback prefs
// ------------------------------------------------------------
// Verse-by-verse audio is streamed from everyayah.com, which
// publishes one MP3 per ayah named `SSSAAA.mp3`. Streaming needs
// a connection; downloaded surahs play fully offline (see
// `recitation-offline.ts`).
// Source: https://everyayah.com/recitations_ayat.html
// ============================================================

import { useCallback, useEffect, useState } from "react";

export const RECITATION_SOURCE_NAME = "everyayah.com";
export const RECITATION_SOURCE_URL = "https://everyayah.com/recitations_ayat.html";
const BASE = "https://everyayah.com/data";

export interface Reciter {
  id: string;
  nameAr: string;
  /** Riwayah / style note shown under the name. */
  styleAr: string;
  /** Folder name on the audio host. */
  folder: string;
  /** Approximate bitrate, for the quality hint. */
  kbps: number;
}

/** Curated, verified list — every folder was checked to return audio. */
export const RECITERS: Reciter[] = [
  {
    id: "alafasy",
    nameAr: "مشاري العفاسي",
    styleAr: "مرتّل، حفص عن عاصم",
    folder: "Alafasy_128kbps",
    kbps: 128,
  },
  {
    id: "husary",
    nameAr: "محمود خليل الحصري",
    styleAr: "مرتّل، مرجع التجويد",
    folder: "Husary_128kbps",
    kbps: 128,
  },
  {
    id: "abdulbasit",
    nameAr: "عبد الباسط عبد الصمد",
    styleAr: "مرتّل، جودة عالية",
    folder: "Abdul_Basit_Murattal_192kbps",
    kbps: 192,
  },
  {
    id: "minshawi",
    nameAr: "محمد صديق المنشاوي",
    styleAr: "مرتّل، صوت خاشع",
    folder: "Minshawy_Murattal_128kbps",
    kbps: 128,
  },
  {
    id: "sudais",
    nameAr: "عبد الرحمن السديس",
    styleAr: "مرتّل، إمام الحرم",
    folder: "Abdurrahmaan_As-Sudais_192kbps",
    kbps: 192,
  },
  {
    id: "shuraim",
    nameAr: "سعود الشريم",
    styleAr: "مرتّل، إمام الحرم",
    folder: "Saood_ash-Shuraym_128kbps",
    kbps: 128,
  },
  {
    id: "muaiqly",
    nameAr: "ماهر المعيقلي",
    styleAr: "مرتّل، إمام الحرم",
    folder: "MaherAlMuaiqly128kbps",
    kbps: 128,
  },
  {
    id: "ghamdi",
    nameAr: "سعد الغامدي",
    styleAr: "مرتّل، هادئ",
    folder: "Ghamadi_40kbps",
    kbps: 40,
  },
  {
    id: "hudhaify",
    nameAr: "علي الحذيفي",
    styleAr: "مرتّل، إمام المسجد النبوي",
    folder: "Hudhaify_128kbps",
    kbps: 128,
  },
  {
    id: "ayyoub",
    nameAr: "محمد أيوب",
    styleAr: "مرتّل، إمام المسجد النبوي",
    folder: "Muhammad_Ayyoub_128kbps",
    kbps: 128,
  },
  {
    id: "dussary",
    nameAr: "ياسر الدوسري",
    styleAr: "مرتّل، مؤثّر",
    folder: "Yasser_Ad-Dussary_128kbps",
    kbps: 128,
  },
  {
    id: "qatami",
    nameAr: "ناصر القطامي",
    styleAr: "مرتّل، عذب",
    folder: "Nasser_Alqatami_128kbps",
    kbps: 128,
  },
  {
    id: "budair",
    nameAr: "صلاح البدير",
    styleAr: "مرتّل، إمام المسجد النبوي",
    folder: "Salah_Al_Budair_128kbps",
    kbps: 128,
  },
  {
    id: "tablaway",
    nameAr: "محمد الطبلاوي",
    styleAr: "مرتّل، مدرسة مصرية",
    folder: "Mohammad_al_Tablaway_128kbps",
    kbps: 128,
  },
  {
    id: "akhdar",
    nameAr: "إبراهيم الأخضر",
    styleAr: "مرتّل، ملف مُخفّف",
    folder: "Ibrahim_Akhdar_32kbps",
    kbps: 32,
  },
  {
    id: "salamah",
    nameAr: "ياسر سلامة",
    styleAr: "مرتّل، واضح",
    folder: "Yaser_Salamah_128kbps",
    kbps: 128,
  },
  {
    id: "basfar",
    nameAr: "عبد الله بصفر",
    styleAr: "مرتّل، جودة عالية",
    folder: "Abdullah_Basfar_192kbps",
    kbps: 192,
  },
  {
    id: "ajamy",
    nameAr: "أحمد بن علي العجمي",
    styleAr: "مرتّل، مؤثّر",
    folder: "Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net",
    kbps: 128,
  },
];

export function getReciter(id: string): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS[0];
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** `001001.mp3` style file name for one ayah. */
export function ayahFileName(surah: number, ayah: number): string {
  return `${pad3(surah)}${pad3(ayah)}.mp3`;
}

/** Streaming URL for one ayah. */
export function ayahAudioUrl(reciter: Reciter, surah: number, ayah: number): string {
  return `${BASE}/${reciter.folder}/${ayahFileName(surah, ayah)}`;
}

/**
 * ملفات everyayah للآية الأولى لا تتضمن البسملة (عدا الفاتحة حيث البسملة هي الآية ١).
 * لذا تُشغَّل البسملة (001001) قبل الآية الأولى من كل سورة عدا الفاتحة والتوبة.
 */
export function needsBasmalaIntro(surah: number, ayah: number): boolean {
  return ayah === 1 && surah !== 1 && surah !== 9 && surah >= 1 && surah <= 114;
}

/* ---------- Playback preferences ---------- */

const KEY = "zen.quran.recitation.prefs.v1"; // gitleaks:allow — مفتاح تخزين محلي، لا سرّ
const EVENT = "zen:recitation-prefs";

export type RepeatMode = "off" | "ayah" | "range";

export interface RecitationPrefs {
  reciterId: string;
  repeat: RepeatMode;
  /** How many times an ayah is repeated when `repeat === "ayah"`. */
  repeatCount: number;
  /** Continue into the next surah when the current one ends. */
  continuous: boolean;
  /** Keep the playing ayah centred on screen. */
  autoScroll: boolean;
  /** 0.75 … 1.5 */
  rate: number;
}

export const DEFAULT_RECITATION_PREFS: RecitationPrefs = {
  reciterId: RECITERS[0].id,
  repeat: "off",
  repeatCount: 3,
  continuous: true,
  autoScroll: true,
  rate: 1,
};

export const RATE_OPTIONS = [0.75, 1, 1.25, 1.5];

function read(): RecitationPrefs {
  if (typeof window === "undefined") return DEFAULT_RECITATION_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_RECITATION_PREFS;
    const parsed = JSON.parse(raw) as Partial<RecitationPrefs>;
    return { ...DEFAULT_RECITATION_PREFS, ...parsed };
  } catch {
    return DEFAULT_RECITATION_PREFS;
  }
}

export function readRecitationPrefs(): RecitationPrefs {
  return read();
}

export function useRecitationPrefs() {
  const [prefs, setPrefs] = useState<RecitationPrefs>(DEFAULT_RECITATION_PREFS);

  useEffect(() => {
    const sync = () => setPrefs(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<RecitationPrefs>) => {
    const next = { ...read(), ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* ignore quota / privacy errors */
    }
    setPrefs(next);
  }, []);

  return { prefs, update, reciter: getReciter(prefs.reciterId) } as const;
}
