/**
 * SOVEREIGN model-compare eval — 40 ta vazifa, hammasi OBYEKTIV avtomatik baholanadi.
 *
 *   coding (15)      — funksiya yozish; yashirin unit-testlar sandbox child process'da (JS / Python)
 *   math (10)        — aniq javobli masala; oxirgi qatordagi "ОТВЕТ: ..." solishtiriladi
 *   instruction (8)  — deterministik tekshiruv: JSON sxema, so'z/gap soni, kalit so'zlar, alifbo
 *   writing (7)      — rus/o'zbek yozuv va tarjima: faqat alifbo, uzunlik, majburiy atamalar
 *                      (uslub sifati BAHOLANMAYDI — metodologiyada yozilgan)
 *
 * Har bir coding vazifasida `reference` bor: `node scripts/eval/run.mjs --self-test`
 * testlarning o'zi to'g'riligini tekshiradi (referens yechim 100% o'tishi shart).
 */

/* ------------------------------------------------------------------ */
/* Yordamchi tekshiruvlar                                               */
/* ------------------------------------------------------------------ */

const CYR = /[Ѐ-ӿ]/g;
const LAT = /[A-Za-z]/g;

/** Kirill harflarining (kirill + lotin) harflarga nisbati. */
export function cyrRatio(text) {
  const c = (text.match(CYR) ?? []).length;
  const l = (text.match(LAT) ?? []).length;
  return c + l === 0 ? 0 : c / (c + l);
}

/** Markdown bezaklarini olib tashlaydi (**, _, #, `), matn tekshiruvlari uchun. */
export function plain(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>]/g, "")
    .trim();
}

export function words(text) {
  return plain(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

export function sentences(text) {
  return plain(text)
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}]/u.test(s));
}

/** ```json ... ``` bo'lsa ichini, aks holda butun matnni JSON sifatida o'qiydi. */
export function parseJsonStrict(text) {
  let t = text.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(t);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

/** "ОТВЕТ: 42" / "ANSWER: 42" / "JAVOB: 42" — oxirgisini oladi. */
export function finalAnswer(text) {
  const re = /(?:ОТВЕТ|ANSWER|JAVOB)\s*[:：]\s*(.+)/gi;
  let m;
  let last = null;
  while ((m = re.exec(text))) last = m[1];
  if (last == null) return null;
  return last.replace(/[*_`$\\]/g, "").replace(/\\boxed\{([^}]*)\}/g, "$1").trim().replace(/[.。]$/, "").trim();
}

function numEq(ans, expected) {
  if (ans == null) return false;
  const m = /-?\d+(?:[.,]\d+)?/.exec(ans);
  if (!m) return false;
  return Math.abs(Number(m[0].replace(",", ".")) - expected) < 1e-9;
}

const check = (ok, reason) => ({ pass: !!ok, reason: ok ? "ok" : reason });

/* ------------------------------------------------------------------ */
/* Coding — hidden unit tests                                           */
/* ------------------------------------------------------------------ */

const JS_SUFFIX_RU = "Верни только код функции на JavaScript в одном блоке ```javascript```, без примеров использования и без импортов.";
const PY_SUFFIX_RU = "Верни только код функции на Python 3 в одном блоке ```python```, без примеров использования, без ввода/вывода. Разрешена только стандартная библиотека.";

const CODING = [
  {
    id: "js-plural-ru",
    runtime: "js",
    fn: "pluralRu",
    lang: "ru",
    prompt: `Напиши функцию pluralRu(n, forms), которая для целого неотрицательного n выбирает правильную форму русского существительного из массива forms = [форма для 1, форма для 2, форма для 5] (например ["яблоко","яблока","яблок"]) и возвращает только эту форму (строку). ${JS_SUFFIX_RU}`,
    cases: [
      [[1, ["яблоко", "яблока", "яблок"]], "яблоко"],
      [[2, ["яблоко", "яблока", "яблок"]], "яблока"],
      [[5, ["яблоко", "яблока", "яблок"]], "яблок"],
      [[11, ["яблоко", "яблока", "яблок"]], "яблок"],
      [[21, ["яблоко", "яблока", "яблок"]], "яблоко"],
      [[22, ["яблоко", "яблока", "яблок"]], "яблока"],
      [[111, ["яблоко", "яблока", "яблок"]], "яблок"],
      [[0, ["яблоко", "яблока", "яблок"]], "яблок"],
      [[104, ["яблоко", "яблока", "яблок"]], "яблока"],
      [[112, ["яблоко", "яблока", "яблок"]], "яблок"],
    ],
    reference: `function pluralRu(n, forms){const a=n%100,b=n%10;if(a>=11&&a<=14)return forms[2];if(b===1)return forms[0];if(b>=2&&b<=4)return forms[1];return forms[2];}`,
  },
  {
    id: "js-palindrome-ru",
    runtime: "js",
    fn: "isPalindromeRu",
    lang: "ru",
    prompt: `Напиши функцию isPalindromeRu(s), которая возвращает true, если строка — палиндром. Регистр, пробелы и знаки препинания игнорируются (учитываются только буквы и цифры), буква «ё» считается равной «е». ${JS_SUFFIX_RU}`,
    cases: [
      [["А роза упала на лапу Азора"], true],
      [["Привет, мир"], false],
      [["Не пил ли пен?"], true],
      [["Её"], true],
      [["Аргентина манит негра"], true],
      [["Абв"], false],
      [["12321"], true],
      [["Ёлка – аклЕ"], true],
    ],
    reference: `function isPalindromeRu(s){const t=s.toLowerCase().replace(/ё/g,"е").replace(/[^\\p{L}\\p{N}]/gu,"");return t===[...t].reverse().join("");}`,
  },
  {
    id: "js-merge-intervals",
    runtime: "js",
    fn: "mergeIntervals",
    lang: "ru",
    prompt: `Напиши функцию mergeIntervals(intervals), которая принимает массив отрезков [start, end] (в произвольном порядке) и возвращает новый массив, в котором пересекающиеся или соприкасающиеся отрезки (например [1,4] и [4,5]) объединены; результат отсортирован по началу. ${JS_SUFFIX_RU}`,
    cases: [
      [[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]],
      [[[[1, 4], [4, 5]]], [[1, 5]]],
      [[[[5, 7], [1, 2]]], [[1, 2], [5, 7]]],
      [[[]], []],
      [[[[1, 10], [2, 3], [4, 5]]], [[1, 10]]],
      [[[[6, 8], [1, 9], [2, 4], [4, 7]]], [[1, 9]]],
    ],
    reference: `function mergeIntervals(iv){const a=iv.map(x=>[x[0],x[1]]).sort((p,q)=>p[0]-q[0]);const r=[];for(const x of a){if(r.length&&x[0]<=r[r.length-1][1])r[r.length-1][1]=Math.max(r[r.length-1][1],x[1]);else r.push(x);}return r;}`,
  },
  {
    id: "js-roman",
    runtime: "js",
    fn: "romanToInt",
    lang: "ru",
    prompt: `Напиши функцию romanToInt(s), которая переводит корректное римское число (I, V, X, L, C, D, M, от 1 до 3999) в целое число. ${JS_SUFFIX_RU}`,
    cases: [
      [["III"], 3],
      [["LVIII"], 58],
      [["MCMXCIV"], 1994],
      [["IV"], 4],
      [["MMXXVI"], 2026],
      [["XLIX"], 49],
      [["MMMCMXCIX"], 3999],
    ],
    reference: `function romanToInt(s){const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let t=0;for(let i=0;i<s.length;i++){const a=v[s[i]],b=v[s[i+1]]||0;t+=a<b?-a:a;}return t;}`,
  },
  {
    id: "js-parse-duration",
    runtime: "js",
    fn: "parseDuration",
    lang: "ru",
    prompt: `Напиши функцию parseDuration(s), которая разбирает строку длительности вида "1ч 30м 15с" и возвращает общее количество секунд (число). Части разделены пробелами, каждая — целое число и единица: «ч» (часы), «м» (минуты), «с» (секунды). Любая часть может отсутствовать, порядок частей произвольный. Пустая строка → 0. ${JS_SUFFIX_RU}`,
    cases: [
      [["1ч 30м 15с"], 5415],
      [["45м"], 2700],
      [["2ч"], 7200],
      [["10с 1м"], 70],
      [[""], 0],
      [["0ч 0м 1с"], 1],
      [["12ч 5с"], 43205],
    ],
    reference: `function parseDuration(s){let t=0;for(const m of s.matchAll(/(\\d+)\\s*([чмс])/g)){const n=Number(m[1]);t+=m[2]==="ч"?n*3600:m[2]==="м"?n*60:n;}return t;}`,
  },
  {
    id: "js-flatten",
    runtime: "js",
    fn: "flattenObject",
    lang: "ru",
    prompt: `Напиши функцию flattenObject(obj), которая превращает вложенный объект в плоский с ключами через точку: {a:{b:1}} → {"a.b":1}. Вложенными считаются только обычные объекты; массивы, null, строки и числа — это листья и копируются как есть. ${JS_SUFFIX_RU}`,
    cases: [
      [[{ a: { b: 1, c: { d: 2 } }, e: 3 }], { "a.b": 1, "a.c.d": 2, e: 3 }],
      [[{ x: [1, { y: 2 }] }], { x: [1, { y: 2 }] }],
      [[{ k: null, s: "str" }], { k: null, s: "str" }],
      [[{ a: { b: { c: { d: { e: "deep" } } } } }], { "a.b.c.d.e": "deep" }],
      [[{}], {}],
    ],
    reference: `function flattenObject(o,p="",r={}){for(const[k,v]of Object.entries(o)){const key=p?p+"."+k:k;if(v&&typeof v==="object"&&!Array.isArray(v))flattenObject(v,key,r);else r[key]=v;}return r;}`,
  },
  {
    id: "js-format-rub",
    runtime: "js",
    fn: "formatRub",
    lang: "ru",
    prompt: `Напиши функцию formatRub(n), которая форматирует число как сумму в рублях: разряды тысяч разделяются обычным пробелом (U+0020), десятичный разделитель — запятая, всегда ровно 2 знака после запятой, в конце — пробел и знак «₽». Для отрицательных чисел в начале ставится дефис-минус «-». Пример: 1234567.891 → "1 234 567,89 ₽". Не используй Intl/toLocaleString (в среде их может не быть). ${JS_SUFFIX_RU}`,
    cases: [
      [[1234567.891], "1 234 567,89 ₽"],
      [[0], "0,00 ₽"],
      [[999.5], "999,50 ₽"],
      [[-1234.5], "-1 234,50 ₽"],
      [[1000], "1 000,00 ₽"],
      [[5.5], "5,50 ₽"],
      [[100000], "100 000,00 ₽"],
    ],
    reference: `function formatRub(n){const neg=n<0;const [i,f]=Math.abs(n).toFixed(2).split(".");return (neg?"-":"")+i.replace(/\\B(?=(\\d{3})+(?!\\d))/g," ")+","+f+" ₽";}`,
  },
  {
    id: "js-eval-rpn",
    runtime: "js",
    fn: "evalRPN",
    lang: "en",
    prompt: "Write a JavaScript function evalRPN(tokens) that evaluates an arithmetic expression in Reverse Polish Notation. tokens is an array of strings: integers (possibly negative, e.g. \"-11\") and the operators \"+\", \"-\", \"*\", \"/\". Division between two integers truncates toward zero. Return the integer result. Return only the function code in a single ```javascript block, no usage examples, no imports.",
    cases: [
      [[["2", "1", "+", "3", "*"]], 9],
      [[["4", "13", "5", "/", "+"]], 6],
      [[["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], 22],
      [[["7", "-2", "/"]], -3],
      [[["42"]], 42],
    ],
    reference: `function evalRPN(t){const s=[];for(const x of t){if(["+","-","*","/"].includes(x)){const b=s.pop(),a=s.pop();s.push(x==="+"?a+b:x==="-"?a-b:x==="*"?a*b:Math.trunc(a/b));}else s.push(Number(x));}return s[0];}`,
  },
  {
    id: "py-top-k-words",
    runtime: "py",
    fn: "top_k_words",
    lang: "ru",
    prompt: `Напиши функцию top_k_words(text, k), которая возвращает список из не более чем k самых частых слов текста. Текст приводится к нижнему регистру; слово — это непрерывная последовательность букв латиницы или кириллицы (a-z, а-я, ё). Сортировка: по убыванию частоты, при равенстве — по возрастанию строки (обычное сравнение строк Python). ${PY_SUFFIX_RU}`,
    cases: [
      [["Кот и пёс. Кот и мышь! КОТ", 2], ["кот", "и"]],
      [["b a b a c", 3], ["a", "b", "c"]],
      [["", 3], []],
      [["Да да ДА нет", 5], ["да", "нет"]],
      [["one, two; two... three-three three", 2], ["three", "two"]],
    ],
    reference: `import re
from collections import Counter
def top_k_words(text, k):
    c = Counter(re.findall(r"[a-zа-яё]+", text.lower()))
    return [w for w, _ in sorted(c.items(), key=lambda x: (-x[1], x[0]))[:k]]`,
  },
  {
    id: "py-inn",
    runtime: "py",
    fn: "is_valid_inn",
    lang: "ru",
    prompt: `Напиши функцию is_valid_inn(s), которая проверяет российский ИНН (строку): 10 цифр для юрлица или 12 цифр для физлица, с проверкой контрольных цифр по официальному алгоритму ФНС. Любая другая длина или нецифровые символы → False. ${PY_SUFFIX_RU}`,
    cases: [
      [["7707083893"], true],
      [["7707083894"], false],
      [["500100732259"], true],
      [["500100732258"], false],
      [["77070838"], false],
      [["77070838a3"], false],
      [["7830002293"], true],
      [["000000000000"], true],
    ],
    reference: `def is_valid_inn(s):
    if not isinstance(s, str) or not s.isdigit() or not s.isascii():
        return False
    d = [int(c) for c in s]
    def cs(w, n):
        return sum(a * b for a, b in zip(w, d[:n])) % 11 % 10
    if len(d) == 10:
        return cs([2,4,10,3,5,9,4,6,8], 9) == d[9]
    if len(d) == 12:
        return cs([7,2,4,10,3,5,9,4,6,8], 10) == d[10] and cs([3,7,2,4,10,3,5,9,4,6,8], 11) == d[11]
    return False`,
  },
  {
    id: "py-spiral",
    runtime: "py",
    fn: "spiral_order",
    lang: "ru",
    prompt: `Напиши функцию spiral_order(matrix), которая возвращает элементы прямоугольной матрицы (список списков) в порядке обхода по спирали по часовой стрелке, начиная с левого верхнего угла. Для пустой матрицы — пустой список. ${PY_SUFFIX_RU}`,
    cases: [
      [[[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [1, 2, 3, 6, 9, 8, 7, 4, 5]],
      [[[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]],
      [[[]], []],
      [[[[1], [2], [3]]], [1, 2, 3]],
      [[[[1, 2]]], [1, 2]],
    ],
    reference: `def spiral_order(m):
    r = []
    m = [list(x) for x in m]
    while m and m[0]:
        r += m.pop(0)
        m = [list(x) for x in zip(*m)][::-1]
    return r`,
  },
  {
    id: "py-lcs",
    runtime: "py",
    fn: "lcs_length",
    lang: "ru",
    prompt: `Напиши функцию lcs_length(a, b), которая возвращает длину наибольшей общей подпоследовательности (не обязательно непрерывной) двух строк. Строки могут быть до 2000 символов, решение должно работать быстро. ${PY_SUFFIX_RU}`,
    cases: [
      [["abcde", "ace"], 3],
      [["abc", "def"], 0],
      [["", "a"], 0],
      [["привет", "приветствие"], 6],
      [["AGGTAB", "GXTXAYB"], 4],
      [["ab".repeat(600), "ba".repeat(600)], 1199],
    ],
    reference: `def lcs_length(a, b):
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]`,
  },
  {
    id: "py-to-snake",
    runtime: "py",
    fn: "to_snake",
    lang: "uz",
    prompt: "Python 3 da to_snake(name) funksiyasini yozing: camelCase/PascalCase identifikatorni snake_case ga o'giradi. Ketma-ket bosh harflar (qisqartma) bitta so'z hisoblanadi: \"parseHTTPResponse\" → \"parse_http_response\", \"HTMLParser\" → \"html_parser\", \"userID\" → \"user_id\". Allaqachon snake_case bo'lsa o'zgarmaydi. Faqat funksiya kodini bitta ```python blokida qaytaring, misollarsiz, faqat standart kutubxona.",
    cases: [
      [["parseHTTPResponse"], "parse_http_response"],
      [["getX"], "get_x"],
      [["simple"], "simple"],
      [["HTMLParser"], "html_parser"],
      [["userID"], "user_id"],
      [["already_snake"], "already_snake"],
      [["MyClassName"], "my_class_name"],
    ],
    reference: `import re
def to_snake(name):
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\\1_\\2", name)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\\1_\\2", s)
    return s.lower()`,
  },
  {
    id: "py-dijkstra",
    runtime: "py",
    fn: "dijkstra",
    lang: "ru",
    prompt: `Напиши функцию dijkstra(n, edges, src): граф из n вершин (0..n-1), edges — список ориентированных рёбер [u, v, w] с неотрицательным весом w. Верни список кратчайших расстояний от src до каждой вершины; для недостижимых вершин — -1. ${PY_SUFFIX_RU}`,
    cases: [
      [[4, [[0, 1, 1], [1, 2, 2], [0, 2, 5], [2, 3, 1]], 0], [0, 1, 3, 4]],
      [[3, [[0, 1, 4]], 0], [0, 4, -1]],
      [[3, [[1, 0, 1]], 0], [0, -1, -1]],
      [[5, [[0, 1, 10], [0, 2, 3], [2, 1, 4], [1, 3, 2], [2, 3, 8], [3, 4, 7]], 0], [0, 7, 3, 9, 16]],
      [[2, [[0, 1, 0]], 1], [-1, 0]],
    ],
    reference: `import heapq
def dijkstra(n, edges, src):
    g = [[] for _ in range(n)]
    for u, v, w in edges:
        g[u].append((v, w))
    d = [None] * n
    d[src] = 0
    pq = [(0, src)]
    while pq:
        c, u = heapq.heappop(pq)
        if c > d[u]:
            continue
        for v, w in g[u]:
            if d[v] is None or c + w < d[v]:
                d[v] = c + w
                heapq.heappush(pq, (c + w, v))
    return [x if x is not None else -1 for x in d]`,
  },
  {
    id: "py-wrap-text",
    runtime: "py",
    fn: "wrap_text",
    lang: "ru",
    prompt: `Напиши функцию wrap_text(text, width), которая жадно разбивает текст на строки длиной не более width символов. Слова разделяются любыми пробельными символами; в строке слова соединяются одним пробелом; слово никогда не разрывается — если оно длиннее width, оно стоит отдельной строкой. Верни список строк (для пустого текста — пустой список). ${PY_SUFFIX_RU}`,
    cases: [
      [["Съешь же ещё этих мягких французских булок", 12], ["Съешь же ещё", "этих мягких", "французских", "булок"]],
      [["a b c", 1], ["a", "b", "c"]],
      [["", 5], []],
      [["сверхдлинноеслово да", 5], ["сверхдлинноеслово", "да"]],
      [["  один   два\nтри  ", 8], ["один два", "три"]],
    ],
    reference: `def wrap_text(text, width):
    lines, cur = [], ""
    for w in text.split():
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= width:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines`,
  },
].map((t) => ({ ...t, category: "coding" }));

/* ------------------------------------------------------------------ */
/* Math / reasoning — exact answers                                     */
/* ------------------------------------------------------------------ */

const MATH_SUFFIX_RU = "Реши задачу. В последней строке напиши ответ строго в формате: ОТВЕТ: <ответ>";

const MATH = [
  {
    id: "math-trains",
    lang: "ru",
    prompt: `Из двух городов, расстояние между которыми 300 км, одновременно навстречу друг другу выехали два поезда со скоростями 60 км/ч и 90 км/ч. Через сколько часов они встретятся? ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 2), "ожидалось 2"),
  },
  {
    id: "math-divisors",
    lang: "ru",
    prompt: `Сколько натуральных делителей у числа 360 (включая 1 и само число)? ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 24), "ожидалось 24"),
  },
  {
    id: "math-dice",
    lang: "ru",
    prompt: `Бросают два обычных шестигранных кубика. Какова вероятность, что сумма очков равна 8? ${MATH_SUFFIX_RU} (несократимая дробь вида a/b)`,
    grade: (r) => check((finalAnswer(r) ?? "").replace(/\s/g, "") === "5/36", "ожидалось 5/36"),
  },
  {
    id: "math-distinct-digits",
    lang: "ru",
    prompt: `Сколько существует четырёхзначных чисел, у которых все цифры различны? ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 4536), "ожидалось 4536"),
  },
  {
    id: "math-sisters",
    lang: "ru",
    prompt: `У Маши три брата. У каждого из братьев ровно две сестры. Сколько сестёр у Маши? ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 1), "ожидалось 1"),
  },
  {
    id: "math-modpow",
    lang: "ru",
    prompt: `Найди остаток от деления 7^100 на 13. ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 9), "ожидалось 9"),
  },
  {
    id: "math-walls-uz",
    lang: "uz",
    prompt: "Agar 5 ta ishchi 5 kunda 5 ta devor qursa, xuddi shunday ishlaydigan 10 ta ishchi 10 kunda nechta devor quradi? Masalani yeching. Oxirgi qatorda javobni qat'iy shu formatda yozing: JAVOB: <son>",
    grade: (r) => check(numEq(finalAnswer(r), 20), "kutilgan 20"),
  },
  {
    id: "math-sequence",
    lang: "ru",
    prompt: `Найди следующее число последовательности: 2, 6, 12, 20, 30, … ${MATH_SUFFIX_RU} (только число)`,
    grade: (r) => check(numEq(finalAnswer(r), 42), "ожидалось 42"),
  },
  {
    id: "math-weekday",
    lang: "ru",
    prompt: `1 января 2026 года — четверг. Какой день недели будет 1 марта 2026 года? ${MATH_SUFFIX_RU} (день недели одним словом по-русски)`,
    grade: (r) => check(/воскресенье/i.test(finalAnswer(r) ?? ""), "ожидалось воскресенье"),
  },
  {
    id: "math-factorial-en",
    lang: "en",
    prompt: "What is the smallest positive integer n such that n! is divisible by 1000? Solve it, then on the last line write the answer strictly in the format: ANSWER: <number>",
    grade: (r) => check(numEq(finalAnswer(r), 15), "expected 15"),
  },
].map((t) => ({ ...t, category: "math" }));

/* ------------------------------------------------------------------ */
/* Instruction following — deterministic checks                          */
/* ------------------------------------------------------------------ */

const INSTRUCTION = [
  {
    id: "if-json-object",
    lang: "ru",
    prompt: "Верни ТОЛЬКО JSON-объект (без пояснений и без markdown) с полями: name (строка), age (целое число), skills (массив ровно из 3 строк) — для вымышленного программиста.",
    grade: (r) => {
      try {
        const j = parseJsonStrict(r);
        const ok =
          j && typeof j === "object" && !Array.isArray(j) &&
          typeof j.name === "string" && Number.isInteger(j.age) &&
          Array.isArray(j.skills) && j.skills.length === 3 && j.skills.every((s) => typeof s === "string") &&
          Object.keys(j).length === 3;
        return check(ok, "схема не совпала");
      } catch {
        return check(false, "не JSON");
      }
    },
  },
  {
    id: "if-json-sorted",
    lang: "ru",
    prompt: 'Верни ТОЛЬКО JSON-массив (без пояснений) из 4 объектов вида {"city": строка, "population_million": число} для четырёх крупных городов России, отсортированный по убыванию population_million.',
    grade: (r) => {
      try {
        const j = parseJsonStrict(r);
        const ok =
          Array.isArray(j) && j.length === 4 &&
          j.every((o) => o && typeof o.city === "string" && typeof o.population_million === "number" && Object.keys(o).length === 2) &&
          j.every((o, i) => i === 0 || j[i - 1].population_million >= o.population_million);
        return check(ok, "схема/сортировка не совпала");
      } catch {
        return check(false, "не JSON");
      }
    },
  },
  {
    id: "if-three-sentences",
    lang: "ru",
    prompt: "Опиши Москву ровно в трёх предложениях, общим объёмом не более 50 слов. Без списков и заголовков.",
    grade: (r) => {
      const s = sentences(r).length;
      const w = words(r).length;
      return check(s === 3 && w <= 50 && cyrRatio(r) > 0.9, `предложений=${s}, слов=${w}`);
    },
  },
  {
    id: "if-keywords",
    lang: "ru",
    prompt: "Напиши короткий совет по безопасности паролей (не более 60 слов). Обязательно используй слова «менеджер», «двухфакторная» и «уникальный» (именно в этих формах).",
    grade: (r) => {
      const t = r.toLowerCase();
      const has = ["менеджер", "двухфакторная", "уникальный"].every((k) => new RegExp(`(^|[^а-яё])${k}([^а-яё]|$)`).test(t));
      const w = words(r).length;
      return check(has && w <= 60, `ключевые=${has}, слов=${w}`);
    },
  },
  {
    id: "if-no-letter-o",
    lang: "ru",
    prompt: "Напиши два предложения о летнем дне, ни разу не используя букву «о» (ни строчную, ни заглавную). Только текст, без пояснений.",
    grade: (r) => {
      const t = plain(r);
      const ok = !/[оО]/.test(t) && words(t).length >= 6 && cyrRatio(t) > 0.9;
      return check(ok, /[оО]/.test(t) ? "есть буква «о»" : "слишком коротко/не по-русски");
    },
  },
  {
    id: "if-numbered-list",
    lang: "ru",
    prompt: "Перечисли 5 фруктов нумерованным списком в формате «1. Яблоко» (по одному на строку, от 1 до 5), без какого-либо другого текста до или после списка.",
    grade: (r) => {
      const lines = r.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const ok = lines.length === 5 && lines.every((l, i) => new RegExp(`^${i + 1}\\.\\s+\\S`).test(l));
      return check(ok, `строк=${lines.length}`);
    },
  },
  {
    id: "if-answer-in-russian",
    lang: "en",
    prompt: "Answer in Russian only (no English words except the acronym API): explain in exactly two sentences what an API is.",
    grade: (r) => {
      const t = plain(r).replace(/\bAPI\b/g, "");
      const s = sentences(r).length;
      return check(cyrRatio(t) > 0.97 && s === 2, `кириллица=${cyrRatio(t).toFixed(2)}, предложений=${s}`);
    },
  },
  {
    id: "if-uppercase",
    lang: "ru",
    prompt: "Ответь ТОЛЬКО ЗАГЛАВНЫМИ буквами (ни одной строчной буквы): назови три цвета радуги через запятую.",
    grade: (r) => {
      const t = plain(r);
      const ok = !/[a-zа-яё]/.test(t) && /[А-ЯЁ]/.test(t) && t.split(",").length >= 3;
      return check(ok, "есть строчные буквы или меньше трёх цветов");
    },
  },
].map((t) => ({ ...t, category: "instruction" }));

/* ------------------------------------------------------------------ */
/* Russian writing / translation — deterministic checks only            */
/* ------------------------------------------------------------------ */

const WRITING = [
  {
    id: "wr-en-ru",
    lang: "ru",
    prompt: "Переведи на русский язык и верни только перевод: \"The quick delivery of the package made the customer very happy.\"",
    grade: (r) => {
      const t = plain(r).toLowerCase();
      const ok = cyrRatio(t) > 0.97 && /клиент|покупател|заказчик/.test(t) && /посылк|пакет|заказ|отправлени|груз/.test(t) && /быстр|оперативн|скор/.test(t) && words(t).length <= 20;
      return check(ok, "нет ключевых терминов или не по-русски");
    },
  },
  {
    id: "wr-ru-en",
    lang: "ru",
    prompt: "Переведи на английский язык и верни только перевод: «Встреча перенесена на пятницу из-за болезни руководителя.»",
    grade: (r) => {
      const t = plain(r);
      const ok = cyrRatio(t) === 0 && /friday/i.test(t) && /meeting/i.test(t) && /postponed|rescheduled|moved|pushed/i.test(t) && /ill|sick/i.test(t) && words(t).length <= 20;
      return check(ok, "missing key terms or not English");
    },
  },
  {
    id: "wr-uz-ru",
    lang: "ru",
    prompt: "Переведи с узбекского на русский и верни только перевод: «Ertaga soat to'qqizda ofisda uchrashamiz.»",
    grade: (r) => {
      const t = plain(r).toLowerCase();
      const ok = cyrRatio(t) > 0.97 && /завтра/.test(t) && /девять|девяти|9/.test(t) && /офис/.test(t) && /встрет|встреча|увидим/.test(t);
      return check(ok, "нет ключевых слов");
    },
  },
  {
    id: "wr-ru-uz",
    lang: "uz",
    prompt: "Rus tilidan o'zbek tiliga (lotin alifbosida) tarjima qiling va faqat tarjimani qaytaring: «Спасибо за вашу помощь, до встречи завтра.»",
    grade: (r) => {
      const t = plain(r).toLowerCase();
      const ok = cyrRatio(t) === 0 && /rahmat|tashakkur/.test(t) && /ertaga/.test(t) && /yordam/.test(t);
      return check(ok, "lotin/kalit so'zlar yo'q");
    },
  },
  {
    id: "wr-business-email",
    lang: "ru",
    prompt: "Напиши короткое деловое письмо на русском языке (не более 120 слов) клиенту с напоминанием об оплате счёта №245 до 15 октября. Письмо должно начинаться с обращения «Уважаемый» и заканчиваться фразой «С уважением».",
    grade: (r) => {
      const t = plain(r);
      const w = words(t).length;
      const ok = cyrRatio(t) > 0.95 && /^\s*(Тема:.*\n+)?\s*Уважаем/m.test(t) && /С уважением/.test(t) && /245/.test(t) && /15 октября/.test(t) && /сч[её]т/i.test(t) && w <= 120;
      return check(ok, `слов=${w}`);
    },
  },
  {
    id: "wr-summary",
    lang: "ru",
    prompt:
      "Сократи следующий текст до ОДНОГО предложения не длиннее 25 слов, сохранив главную мысль. Верни только это предложение.\n\nТекст: «В 2025 году компания перевела всю бухгалтерию на облачную систему. Это позволило сократить время закрытия месяца с десяти до трёх рабочих дней. Кроме того, число ошибок в отчётах уменьшилось почти вдвое, а сотрудники получили доступ к данным из любого места.»",
    grade: (r) => {
      const t = plain(r);
      const s = sentences(t).length;
      const w = words(t).length;
      const ok = cyrRatio(t) > 0.95 && s === 1 && w <= 25 && /облак|облач/i.test(t);
      return check(ok, `предложений=${s}, слов=${w}`);
    },
  },
  {
    id: "wr-product",
    lang: "ru",
    prompt: "Напиши описание товара «умная колонка» для интернет-магазина: от 40 до 80 слов, на русском языке, одним абзацем, обязательно упомяни управление голосом (слово «голос» в любой форме).",
    grade: (r) => {
      const t = plain(r);
      const w = words(t).length;
      const ok = cyrRatio(t) > 0.9 && w >= 40 && w <= 80 && /голос/i.test(t);
      return check(ok, `слов=${w}`);
    },
  },
].map((t) => ({ ...t, category: "writing" }));

export const TASKS = [...CODING, ...MATH, ...INSTRUCTION, ...WRITING];
export const CATEGORIES = ["coding", "math", "instruction", "writing"];
