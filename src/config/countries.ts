/**
 * ISO 3166-1 alpha-242 davlat kodlari (259 ta). Nomlar brauzerning
 * Intl.DisplayNames orqali tanlangan tilda olinadi — 260 ta nomni qo'lda
 * tarjima qilish shart emas; ICU'da tarjima bo'lmasa inglizcha chiqadi.
 */

export const COUNTRY_CODES: readonly string[] = ["AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GT","GU","GW","GY","HK","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW"];

/** Mintaqa uchun eng ko'p tanlanadiganlar — ro'yxat boshida ko'rinadi. */
export const POPULAR_COUNTRY_CODES: readonly string[] = ["UZ","KZ","KG","TJ","TM","RU","TR","KR","AE","US","DE","GB","CN","IN","SA","JP","FR","AZ"];

/**
 * O'zbekcha nomlar — Node'ning to'liq ICU'sidan olingan statik ro'yxat. Brauzerlarda
 * (ayniqsa Chromium) "uz" region nomlari ko'pincha yo'q va tizim tiliga tushib ketadi.
 */
export const UZ_COUNTRY_NAMES: Record<string, string> = {"AD":"Andorra","AE":"Birlashgan Arab Amirliklari","AF":"Afgʻoniston","AG":"Antigua va Barbuda","AI":"Angilya","AL":"Albaniya","AM":"Armaniston","AO":"Angola","AR":"Argentina","AS":"Amerika Samoasi","AT":"Avstriya","AU":"Avstraliya","AW":"Aruba","AX":"Aland orollari","AZ":"Ozarbayjon","BA":"Bosniya va Gertsegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgiya","BF":"Burkina-Faso","BG":"Bolgariya","BH":"Bahrayn","BI":"Burundi","BJ":"Benin","BL":"Sen-Bartelemi","BM":"Bermuda orollari","BN":"Bruney","BO":"Boliviya","BQ":"Boneyr, Sint-Estatius va Saba","BR":"Braziliya","BS":"Bagama orollari","BT":"Butan","BW":"Botsvana","BY":"Belarus","BZ":"Beliz","CA":"Kanada","CC":"Kokos (Kiling) orollari","CD":"Kongo – Kinshasa","CF":"Markaziy Afrika Respublikasi","CG":"Kongo – Brazzavil","CH":"Shveytsariya","CI":"Kot-d’Ivuar","CK":"Kuk orollari","CL":"Chili","CM":"Kamerun","CN":"Xitoy","CO":"Kolumbiya","CR":"Kosta-Rika","CU":"Kuba","CV":"Kabo-Verde","CW":"Kyurasao","CX":"Rojdestvo oroli","CY":"Kipr","CZ":"Chexiya","DE":"Germaniya","DJ":"Jibuti","DK":"Daniya","DM":"Dominika","DO":"Dominikan Respublikasi","DZ":"Jazoir","EC":"Ekvador","EE":"Estoniya","EG":"Misr","EH":"G‘arbiy Sahroi Kabir","ER":"Eritreya","ES":"Ispaniya","ET":"Efiopiya","FI":"Finlandiya","FJ":"Fiji","FK":"Folklend orollari","FM":"Mikroneziya","FO":"Farer orollari","FR":"Fransiya","GA":"Gabon","GB":"Buyuk Britaniya","GD":"Grenada","GE":"Gruziya","GF":"Fransuz Gvianasi","GG":"Gernsi","GH":"Gana","GI":"Gibraltar","GL":"Grenlandiya","GM":"Gambiya","GN":"Gvineya","GP":"Gvadelupe","GQ":"Ekvatorial Gvineya","GR":"Gretsiya","GT":"Gvatemala","GU":"Guam","GW":"Gvineya-Bisau","GY":"Gayana","HK":"Gonkong (Xitoy MMH)","HN":"Gonduras","HR":"Xorvatiya","HT":"Gaiti","HU":"Vengriya","ID":"Indoneziya","IE":"Irlandiya","IL":"Isroil","IM":"Men oroli","IN":"Hindiston","IO":"Britaniyaning Hind okeanidagi hududi","IQ":"Iroq","IR":"Eron","IS":"Islandiya","IT":"Italiya","JE":"Jersi","JM":"Yamayka","JO":"Iordaniya","JP":"Yaponiya","KE":"Keniya","KG":"Qirgʻiziston","KH":"Kambodja","KI":"Kiribati","KM":"Komor orollari","KN":"Sent-Kits va Nevis","KP":"Shimoliy Koreya","KR":"Janubiy Koreya","KW":"Quvayt","KY":"Kayman orollari","KZ":"Qozogʻiston","LA":"Laos","LB":"Livan","LC":"Sent-Lyusiya","LI":"Lixtenshteyn","LK":"Shri-Lanka","LR":"Liberiya","LS":"Lesoto","LT":"Litva","LU":"Lyuksemburg","LV":"Latviya","LY":"Liviya","MA":"Marokash","MC":"Monako","MD":"Moldova","ME":"Chernogoriya","MF":"Sent-Martin","MG":"Madagaskar","MH":"Marshall orollari","MK":"Shimoliy Makedoniya","ML":"Mali","MM":"Myanma (Birma)","MN":"Mongoliya","MO":"Makao (Xitoy MMH)","MP":"Shimoliy Mariana orollari","MQ":"Martinika","MR":"Mavritaniya","MS":"Montserrat","MT":"Malta","MU":"Mavrikiy","MV":"Maldiv orollari","MW":"Malavi","MX":"Meksika","MY":"Malayziya","MZ":"Mozambik","NA":"Namibiya","NC":"Yangi Kaledoniya","NE":"Niger","NF":"Norfolk oroli","NG":"Nigeriya","NI":"Nikaragua","NL":"Niderlandiya","NO":"Norvegiya","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"Yangi Zelandiya","OM":"Ummon","PA":"Panama","PE":"Peru","PF":"Fransuz Polineziyasi","PG":"Papua – Yangi Gvineya","PH":"Filippin","PK":"Pokiston","PL":"Polsha","PM":"Sen-Pyer va Mikelon","PN":"Pitkern orollari","PR":"Puerto-Riko","PS":"Falastin hududlari","PT":"Portugaliya","PW":"Palau","PY":"Paragvay","QA":"Qatar","RE":"Reyunion","RO":"Ruminiya","RS":"Serbiya","RU":"Rossiya","RW":"Ruanda","SA":"Saudiya Arabistoni","SB":"Solomon orollari","SC":"Seyshel orollari","SD":"Sudan","SE":"Shvetsiya","SG":"Singapur","SH":"Muqaddas Yelena oroli","SI":"Sloveniya","SK":"Slovakiya","SL":"Syerra-Leone","SM":"San-Marino","SN":"Senegal","SO":"Somali","SR":"Surinam","SS":"Janubiy Sudan","ST":"San-Tome va Prinsipi","SV":"Salvador","SX":"Sint-Marten","SY":"Suriya","SZ":"Svazilend","TC":"Turks va Kaykos orollari","TD":"Chad","TG":"Togo","TH":"Tailand","TJ":"Tojikiston","TK":"Tokelau","TL":"Timor-Leste","TM":"Turkmaniston","TN":"Tunis","TO":"Tonga","TR":"Turkiya","TT":"Trinidad va Tobago","TV":"Tuvalu","TW":"Tayvan","TZ":"Tanzaniya","UA":"Ukraina","UG":"Uganda","US":"Amerika Qo‘shma Shtatlari","UY":"Urugvay","UZ":"Oʻzbekiston","VA":"Vatikan","VC":"Sent-Vinsent va Grenadin","VE":"Venesuela","VG":"Britaniya Virgin orollari","VI":"AQSH Virgin orollari","VN":"Vyetnam","VU":"Vanuatu","WF":"Uollis va Futuna","WS":"Samoa","YE":"Yaman","YT":"Mayotta","ZA":"Janubiy Afrika Respublikasi","ZM":"Zambiya","ZW":"Zimbabve"};

const cache = new Map<string, Intl.DisplayNames | null>();

function displayNames(lang: string): Intl.DisplayNames | null {
  if (cache.has(lang)) return cache.get(lang)!;
  let dn: Intl.DisplayNames | null = null;
  try {
    // Til qo'llanmasa Intl tizim tiliga (masalan rus) tushib ketadi — buni istamaymiz.
    if (Intl.DisplayNames.supportedLocalesOf([lang]).length === 0) throw new Error("unsupported");
    dn = new Intl.DisplayNames([lang], { type: "region", fallback: "code" });
  } catch {
    dn = null;
  }
  cache.set(lang, dn);
  return dn;
}

/** Davlat nomi tanlangan tilda; topilmasa inglizcha, u ham bo'lmasa kod. */
export function countryName(code: string, lang = "uz"): string {
  if (lang === "uz" && UZ_COUNTRY_NAMES[code]) return UZ_COUNTRY_NAMES[code];
  const primary = displayNames(lang)?.of(code);
  if (primary && primary !== code) return primary;
  const en = displayNames("en")?.of(code);
  return en && en !== code ? en : code;
}

/** 🇺🇿 kabi bayroq — ikki harfni regional indicator belgilariga aylantirish. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Qidiruv: nomning boshi yoki so'zlarning boshi mos kelsa. */
export function searchCountries(query: string, lang = "uz", limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...POPULAR_COUNTRY_CODES];
  const hits: string[] = [];
  for (const code of COUNTRY_CODES) {
    const names = [countryName(code, lang), countryName(code, "en"), code].map((n) => n.toLowerCase());
    if (names.some((n) => n.startsWith(q) || n.split(/[\s-]+/).some((w) => w.startsWith(q)))) hits.push(code);
    if (hits.length >= limit) break;
  }
  return hits;
}
