// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Surah metadata for all 114 Surahs.
// ------------------------------------------------------------
// Source: standard Madani Mushaf (604 pages, 30 Juz, 60 Hizb).
// No verses, no text — metadata only.
// ============================================================

import type { SurahMeta } from "./types";

/**
 * Raw compact rows keyed by Surah id.
 * Format: [nameAr, nameEn, meaningEn, revelation, ayatCount,
 *          juzStart, juzEnd, hizbStart, hizbEnd, pageStart, pageEnd,
 *          revelationOrder]
 */
type Row = [
  string, // nameAr
  string, // nameEn
  string, // meaningEn
  "makki" | "madani",
  number, // ayatCount
  number, // juzStart
  number, // juzEnd
  number, // hizbStart
  number, // hizbEnd
  number, // pageStart
  number, // pageEnd
  number, // revelationOrder
];

// prettier-ignore
const ROWS: Row[] = [
  ["الفاتحة","Al-Fatihah","The Opener","makki",7,1,1,1,1,1,1,5],
  ["البقرة","Al-Baqarah","The Cow","madani",286,1,3,1,5,2,49,87],
  ["آل عمران","Aal-i-Imran","Family of Imran","madani",200,3,4,5,8,50,76,89],
  ["النساء","An-Nisa","The Women","madani",176,4,6,8,11,77,106,92],
  ["المائدة","Al-Maidah","The Table Spread","madani",120,6,7,11,13,106,127,112],
  ["الأنعام","Al-Anam","The Cattle","makki",165,7,8,13,15,128,150,55],
  ["الأعراف","Al-Araf","The Heights","makki",206,8,9,16,18,151,176,39],
  ["الأنفال","Al-Anfal","The Spoils of War","madani",75,9,10,18,19,177,186,88],
  ["التوبة","At-Tawbah","The Repentance","madani",129,10,11,19,21,187,207,113],
  ["يونس","Yunus","Jonah","makki",109,11,11,21,22,208,221,51],
  ["هود","Hud","Hud","makki",123,11,12,22,24,221,235,52],
  ["يوسف","Yusuf","Joseph","makki",111,12,13,24,25,235,248,53],
  ["الرعد","Ar-Rad","The Thunder","madani",43,13,13,25,26,249,255,96],
  ["إبراهيم","Ibrahim","Abraham","makki",52,13,13,26,26,255,261,72],
  ["الحجر","Al-Hijr","The Rocky Tract","makki",99,14,14,27,27,262,267,54],
  ["النحل","An-Nahl","The Bee","makki",128,14,14,27,28,267,281,70],
  ["الإسراء","Al-Isra","The Night Journey","makki",111,15,15,29,30,282,293,50],
  ["الكهف","Al-Kahf","The Cave","makki",110,15,16,30,31,293,304,69],
  ["مريم","Maryam","Mary","makki",98,16,16,31,31,305,312,44],
  ["طه","Ta-Ha","Ta-Ha","makki",135,16,16,32,32,312,321,45],
  ["الأنبياء","Al-Anbiya","The Prophets","makki",112,17,17,33,33,322,331,73],
  ["الحج","Al-Hajj","The Pilgrimage","madani",78,17,17,34,34,332,341,103],
  ["المؤمنون","Al-Muminun","The Believers","makki",118,18,18,35,35,342,349,74],
  ["النور","An-Nur","The Light","madani",64,18,18,35,36,350,359,102],
  ["الفرقان","Al-Furqan","The Criterion","makki",77,18,19,36,37,359,366,42],
  ["الشعراء","Ash-Shuara","The Poets","makki",227,19,19,37,38,367,376,47],
  ["النمل","An-Naml","The Ant","makki",93,19,20,38,39,377,385,48],
  ["القصص","Al-Qasas","The Stories","makki",88,20,20,39,40,385,396,49],
  ["العنكبوت","Al-Ankabut","The Spider","makki",69,20,21,40,41,396,404,85],
  ["الروم","Ar-Rum","The Romans","makki",60,21,21,41,41,404,410,84],
  ["لقمان","Luqman","Luqman","makki",34,21,21,41,42,411,414,57],
  ["السجدة","As-Sajdah","The Prostration","makki",30,21,21,42,42,415,417,75],
  ["الأحزاب","Al-Ahzab","The Combined Forces","madani",73,21,22,42,43,418,427,90],
  ["سبأ","Saba","Sheba","makki",54,22,22,43,44,428,434,58],
  ["فاطر","Fatir","Originator","makki",45,22,22,44,44,434,440,43],
  ["يس","Ya-Sin","Ya-Sin","makki",83,22,23,44,45,440,445,41],
  ["الصافات","As-Saffat","Those Who Set the Ranks","makki",182,23,23,45,46,446,452,56],
  ["ص","Sad","The Letter Sad","makki",88,23,23,46,46,453,458,38],
  ["الزمر","Az-Zumar","The Troops","makki",75,23,24,46,47,458,467,59],
  ["غافر","Ghafir","The Forgiver","makki",85,24,24,47,48,467,476,60],
  ["فصلت","Fussilat","Explained in Detail","makki",54,24,25,48,49,477,482,61],
  ["الشورى","Ash-Shura","The Consultation","makki",53,25,25,49,49,483,489,62],
  ["الزخرف","Az-Zukhruf","The Gold Adornments","makki",89,25,25,49,50,489,495,63],
  ["الدخان","Ad-Dukhan","The Smoke","makki",59,25,25,50,50,496,498,64],
  ["الجاثية","Al-Jathiyah","The Crouching","makki",37,25,25,50,50,499,502,65],
  ["الأحقاف","Al-Ahqaf","The Wind-Curved Sandhills","makki",35,26,26,51,51,502,506,66],
  ["محمد","Muhammad","Muhammad","madani",38,26,26,51,51,507,510,95],
  ["الفتح","Al-Fath","The Victory","madani",29,26,26,51,52,511,515,111],
  ["الحجرات","Al-Hujurat","The Rooms","madani",18,26,26,52,52,515,517,106],
  ["ق","Qaf","The Letter Qaf","makki",45,26,26,52,52,518,520,34],
  ["الذاريات","Adh-Dhariyat","The Winnowing Winds","makki",60,26,27,52,53,520,523,67],
  ["الطور","At-Tur","The Mount","makki",49,27,27,53,53,523,525,76],
  ["النجم","An-Najm","The Star","makki",62,27,27,53,53,526,528,23],
  ["القمر","Al-Qamar","The Moon","makki",55,27,27,53,53,528,531,37],
  ["الرحمن","Ar-Rahman","The Most Merciful","madani",78,27,27,54,54,531,534,97],
  ["الواقعة","Al-Waqiah","The Inevitable","makki",96,27,27,54,54,534,537,46],
  ["الحديد","Al-Hadid","The Iron","madani",29,27,27,54,54,537,541,94],
  ["المجادلة","Al-Mujadilah","The Pleading Woman","madani",22,28,28,55,55,542,545,105],
  ["الحشر","Al-Hashr","The Exile","madani",24,28,28,55,55,545,548,101],
  ["الممتحنة","Al-Mumtahanah","She That Is to Be Examined","madani",13,28,28,55,55,549,551,91],
  ["الصف","As-Saff","The Ranks","madani",14,28,28,55,55,551,552,109],
  ["الجمعة","Al-Jumuah","Friday","madani",11,28,28,56,56,553,554,110],
  ["المنافقون","Al-Munafiqun","The Hypocrites","madani",11,28,28,56,56,554,555,104],
  ["التغابن","At-Taghabun","The Mutual Disillusion","madani",18,28,28,56,56,556,557,108],
  ["الطلاق","At-Talaq","Divorce","madani",12,28,28,56,56,558,559,99],
  ["التحريم","At-Tahrim","The Prohibition","madani",12,28,28,56,56,560,561,107],
  ["الملك","Al-Mulk","The Sovereignty","makki",30,29,29,57,57,562,564,77],
  ["القلم","Al-Qalam","The Pen","makki",52,29,29,57,57,564,566,2],
  ["الحاقة","Al-Haqqah","The Reality","makki",52,29,29,57,57,566,568,78],
  ["المعارج","Al-Maarij","The Ascending Stairways","makki",44,29,29,57,57,568,570,79],
  ["نوح","Nuh","Noah","makki",28,29,29,57,57,570,571,71],
  ["الجن","Al-Jinn","The Jinn","makki",28,29,29,58,58,572,573,40],
  ["المزمل","Al-Muzzammil","The Enshrouded One","makki",20,29,29,58,58,574,575,3],
  ["المدثر","Al-Muddaththir","The Cloaked One","makki",56,29,29,58,58,575,577,4],
  ["القيامة","Al-Qiyamah","The Resurrection","makki",40,29,29,58,58,577,578,31],
  ["الإنسان","Al-Insan","Man","madani",31,29,29,58,58,578,580,98],
  ["المرسلات","Al-Mursalat","The Emissaries","makki",50,29,29,58,58,580,581,33],
  ["النبأ","An-Naba","The Tidings","makki",40,30,30,59,59,582,583,80],
  ["النازعات","An-Naziat","Those Who Drag Forth","makki",46,30,30,59,59,583,584,81],
  ["عبس","Abasa","He Frowned","makki",42,30,30,59,59,585,585,24],
  ["التكوير","At-Takwir","The Overthrowing","makki",29,30,30,59,59,586,586,7],
  ["الانفطار","Al-Infitar","The Cleaving","makki",19,30,30,59,59,587,587,82],
  ["المطففين","Al-Mutaffifin","The Defrauding","makki",36,30,30,59,59,587,589,86],
  ["الانشقاق","Al-Inshiqaq","The Splitting Open","makki",25,30,30,59,59,589,589,83],
  ["البروج","Al-Buruj","The Constellations","makki",22,30,30,59,59,590,590,27],
  ["الطارق","At-Tariq","The Morning Star","makki",17,30,30,59,59,591,591,36],
  ["الأعلى","Al-Ala","The Most High","makki",19,30,30,60,60,591,592,8],
  ["الغاشية","Al-Ghashiyah","The Overwhelming","makki",26,30,30,60,60,592,592,68],
  ["الفجر","Al-Fajr","The Dawn","makki",30,30,30,60,60,593,594,10],
  ["البلد","Al-Balad","The City","makki",20,30,30,60,60,594,594,35],
  ["الشمس","Ash-Shams","The Sun","makki",15,30,30,60,60,595,595,26],
  ["الليل","Al-Layl","The Night","makki",21,30,30,60,60,595,596,9],
  ["الضحى","Ad-Duha","The Morning Hours","makki",11,30,30,60,60,596,596,11],
  ["الشرح","Ash-Sharh","The Relief","makki",8,30,30,60,60,596,596,12],
  ["التين","At-Tin","The Fig","makki",8,30,30,60,60,597,597,28],
  ["العلق","Al-Alaq","The Clot","makki",19,30,30,60,60,597,597,1],
  ["القدر","Al-Qadr","The Power","makki",5,30,30,60,60,598,598,25],
  ["البينة","Al-Bayyinah","The Clear Proof","madani",8,30,30,60,60,598,599,100],
  ["الزلزلة","Az-Zalzalah","The Earthquake","madani",8,30,30,60,60,599,599,93],
  ["العاديات","Al-Adiyat","The Chargers","makki",11,30,30,60,60,599,600,14],
  ["القارعة","Al-Qariah","The Calamity","makki",11,30,30,60,60,600,600,30],
  ["التكاثر","At-Takathur","Competition","makki",8,30,30,60,60,600,600,16],
  ["العصر","Al-Asr","The Declining Day","makki",3,30,30,60,60,601,601,13],
  ["الهمزة","Al-Humazah","The Traducer","makki",9,30,30,60,60,601,601,32],
  ["الفيل","Al-Fil","The Elephant","makki",5,30,30,60,60,601,601,19],
  ["قريش","Quraysh","Quraysh","makki",4,30,30,60,60,602,602,29],
  ["الماعون","Al-Maun","Small Kindnesses","makki",7,30,30,60,60,602,602,17],
  ["الكوثر","Al-Kawthar","The Abundance","makki",3,30,30,60,60,602,602,15],
  ["الكافرون","Al-Kafirun","The Disbelievers","makki",6,30,30,60,60,603,603,18],
  ["النصر","An-Nasr","The Divine Support","madani",3,30,30,60,60,603,603,114],
  ["المسد","Al-Masad","The Palm Fiber","makki",5,30,30,60,60,603,603,6],
  ["الإخلاص","Al-Ikhlas","Sincerity","makki",4,30,30,60,60,604,604,22],
  ["الفلق","Al-Falaq","The Daybreak","makki",5,30,30,60,60,604,604,20],
  ["الناس","An-Nas","Mankind","makki",6,30,30,60,60,604,604,21],
];

export const SURAH_META: readonly SurahMeta[] = ROWS.map((r, i) => ({
  id: i + 1,
  nameAr: r[0],
  nameEn: r[1],
  meaningEn: r[2],
  revelation: r[3],
  ayatCount: r[4],
  juz: { start: r[5], end: r[6] },
  hizb: { start: r[7], end: r[8] },
  pages: { start: r[9], end: r[10] },
  revelationOrder: r[11],
}));
