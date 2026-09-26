import type { Dict } from "@/lib/i18n";

/** auth bo'limi tarjimalari (uz / uz-cyrl / ru / en). Kalitlar global DICT ga qo'shiladi. */
export const AUTH = {
  // ── Sahifalar (login / register) ──
  auRegisterMetaTitle: { uz: "Hisob yaratish", "uz-cyrl": "Ҳисоб яратиш", ru: "Создание аккаунта", en: "Create account" },
  auWelcome: { uz: "Xush kelibsiz", "uz-cyrl": "Хуш келибсиз", ru: "С возвращением", en: "Welcome back" },
  auLoginSubtitle: {
    uz: "Hisobingizga kiring va davom eting",
    "uz-cyrl": "Ҳисобингизга киринг ва давом этинг",
    ru: "Войдите в аккаунт, чтобы продолжить",
    en: "Sign in to your account to continue",
  },
  auNoAccount: { uz: "Hisobingiz yo'qmi?", "uz-cyrl": "Ҳисобингиз йўқми?", ru: "Нет аккаунта?", en: "Don't have an account?" },
  auSignUpLink: { uz: "Ro'yxatdan o'ting →", "uz-cyrl": "Рўйхатдан ўтинг →", ru: "Зарегистрируйтесь →", en: "Sign up →" },
  auRegisterTitle: { uz: "Hisobingizni yarating", "uz-cyrl": "Ҳисобингизни яратинг", ru: "Создайте аккаунт", en: "Create your account" },
  auRegisterSubtitle: { uz: "30 soniyada tayyor", "uz-cyrl": "30 сонияда тайёр", ru: "Готово за 30 секунд", en: "Ready in 30 seconds" },
  auHaveAccount: { uz: "Hisobingiz bormi?", "uz-cyrl": "Ҳисобингиз борми?", ru: "Уже есть аккаунт?", en: "Already have an account?" },
  auSignInLink: { uz: "Kiring →", "uz-cyrl": "Киринг →", ru: "Войдите →", en: "Log in →" },

  // ── Trust badges / vizual panel ──
  auBadgeEncryption: { uz: "Shifrlangan ulanish (TLS)", "uz-cyrl": "Шифрланган уланиш (TLS)", ru: "Шифрованное соединение (TLS)", en: "Encrypted connection (TLS)" },
  auBadgeNoAds: { uz: "Reklamasiz", "uz-cyrl": "Рекламасиз", ru: "Без рекламы", en: "No ads" },
  auHeroA: { uz: "Birinchi marta AI ", "uz-cyrl": "Биринчи марта AI ", ru: "Впервые ИИ принадлежит ", en: "For the first time, AI belongs to " },
  auHeroB: { uz: "sizga", "uz-cyrl": "сизга", ru: "вам", en: "you" },
  auHeroC: { uz: " tegishli.", "uz-cyrl": " тегишли.", ru: ".", en: "." },
  auHeroDesc: {
    uz: "Bitta hisob. Barcha modellar. Xotira sizning nazoratingizda — istalgan payt ko'rasiz yoki o'chirasiz.",
    "uz-cyrl": "Битта ҳисоб. Барча моделлар. Хотира сизнинг назоратингизда — исталган пайт кўрасиз ёки ўчирасиз.",
    ru: "Один аккаунт. Все модели. Память под вашим контролем — смотрите или удаляйте в любой момент.",
    en: "One account. Every model. Memory under your control — view or delete it any time.",
  },

  // ── Formalar ──
  auOr: { uz: "yoki", "uz-cyrl": "ёки", ru: "или", en: "or" },
  auEmail: { uz: "Email", "uz-cyrl": "Email", ru: "Email", en: "Email" },
  auPassword: { uz: "Parol", "uz-cyrl": "Парол", ru: "Пароль", en: "Password" },
  auForgotPassword: { uz: "Parolni unutdingizmi?", "uz-cyrl": "Паролни унутдингизми?", ru: "Забыли пароль?", en: "Forgot password?" },
  auPasswordPlaceholder: { uz: "Parolingiz", "uz-cyrl": "Паролингиз", ru: "Ваш пароль", en: "Your password" },
  auSendResetLink: { uz: "Tiklash havolasini yuborish", "uz-cyrl": "Тиклаш ҳаволасини юбориш", ru: "Отправить ссылку для сброса", en: "Send reset link" },
  auBackToPasswordLogin: {
    uz: "← Parol bilan kirishga qaytish",
    "uz-cyrl": "← Парол билан киришга қайтиш",
    ru: "← Вернуться ко входу по паролю",
    en: "← Back to password sign-in",
  },
  auResetSent: {
    uz: "Parolni tiklash havolasi emailingizga yuborildi.",
    "uz-cyrl": "Паролни тиклаш ҳаволаси электрон почтангизга юборилди.",
    ru: "Ссылка для сброса пароля отправлена на вашу почту.",
    en: "A password reset link has been sent to your email.",
  },
  auShowPassword: { uz: "Parolni ko'rsatish", "uz-cyrl": "Паролни кўрсатиш", ru: "Показать пароль", en: "Show password" },
  auHidePassword: { uz: "Parolni yashirish", "uz-cyrl": "Паролни яшириш", ru: "Скрыть пароль", en: "Hide password" },
  auPasswordMinPlaceholder: { uz: "Kamida 8 belgi", "uz-cyrl": "Камида 8 белги", ru: "Минимум 8 символов", en: "At least 8 characters" },
  auConfirmPassword: { uz: "Parolni tasdiqlash", "uz-cyrl": "Паролни тасдиқлаш", ru: "Подтверждение пароля", en: "Confirm password" },
  auConfirmPasswordPlaceholder: { uz: "Parolni qayta kiriting", "uz-cyrl": "Паролни қайта киритинг", ru: "Введите пароль ещё раз", en: "Re-enter your password" },
  auAcceptPrefix: { uz: "", "uz-cyrl": "", ru: "Я принимаю ", en: "I agree to the " },
  auAcceptLink: { uz: "Foydalanish shartlariga", "uz-cyrl": "Фойдаланиш шартларига", ru: "условия использования", en: "Terms of Use" },
  auAcceptSuffix: { uz: " roziman", "uz-cyrl": " розиман", ru: "", en: "" },
  auContinue: { uz: "Davom etish", "uz-cyrl": "Давом этиш", ru: "Продолжить", en: "Continue" },
  auCheckInbox: { uz: "Pochtangizni tekshiring", "uz-cyrl": "Почтангизни текширинг", ru: "Проверьте почту", en: "Check your inbox" },
  auSentToPrefix: { uz: "", "uz-cyrl": "", ru: "Ссылка для подтверждения отправлена на ", en: "We sent a confirmation link to " },
  auSentToSuffix: {
    uz: " manziliga tasdiqlash havolasi yuborildi.",
    "uz-cyrl": " манзилига тасдиқлаш ҳаволаси юборилди.",
    ru: ".",
    en: ".",
  },
  auAfterConfirm: {
    uz: "Havolani bosganingizdan so'ng onboarding boshlanadi.",
    "uz-cyrl": "Ҳаволани босганингиздан сўнг онбординг бошланади.",
    ru: "После перехода по ссылке начнётся настройка.",
    en: "Onboarding starts once you click the link.",
  },
  auNoEmail: {
    uz: "Xat kelmadimi? Spam papkasini tekshiring.",
    "uz-cyrl": "Хат келмадими? Спам папкасини текширинг.",
    ru: "Письмо не пришло? Проверьте папку «Спам».",
    en: "No email? Check your spam folder.",
  },

  // ── OAuth ──
  auContinueGoogle: { uz: "Google bilan davom etish", "uz-cyrl": "Google билан давом этиш", ru: "Продолжить с Google", en: "Continue with Google" },
  auContinueGitHub: { uz: "GitHub bilan davom etish", "uz-cyrl": "GitHub билан давом этиш", ru: "Продолжить с GitHub", en: "Continue with GitHub" },
  auErrGoogle: { uz: "Google bilan kirishda xato", "uz-cyrl": "Google билан киришда хато", ru: "Ошибка входа через Google", en: "Google sign-in failed" },
  auErrPopupClosed: {
    uz: "Oyna yopildi. Qayta urinib ko'ring.",
    "uz-cyrl": "Ойна ёпилди. Қайта уриниб кўринг.",
    ru: "Окно было закрыто. Попробуйте ещё раз.",
    en: "The window was closed. Please try again.",
  },

  // ── Validatsiya (zod) ──
  auErrEmail: { uz: "To'g'ri email manzil kiriting", "uz-cyrl": "Тўғри электрон почта манзилини киритинг", ru: "Введите корректный email", en: "Enter a valid email address" },
  auErrPwMin: {
    uz: "Parol kamida 8 belgidan iborat bo'lsin",
    "uz-cyrl": "Парол камида 8 белгидан иборат бўлсин",
    ru: "Пароль должен содержать не менее 8 символов",
    en: "Password must be at least 8 characters",
  },
  auErrPwMax: { uz: "Parol juda uzun", "uz-cyrl": "Парол жуда узун", ru: "Пароль слишком длинный", en: "Password is too long" },
  auErrTerms: {
    uz: "Davom etish uchun shartlarga rozilik bering",
    "uz-cyrl": "Давом этиш учун шартларга розилик беринг",
    ru: "Чтобы продолжить, примите условия",
    en: "Please accept the terms to continue",
  },
  auErrPwMismatch: { uz: "Parollar mos kelmadi", "uz-cyrl": "Пароллар мос келмади", ru: "Пароли не совпадают", en: "Passwords don't match" },
  auErrPwRequired: { uz: "Parolni kiriting", "uz-cyrl": "Паролни киритинг", ru: "Введите пароль", en: "Enter your password" },
  auErrInvalidData: { uz: "Noto'g'ri ma'lumot", "uz-cyrl": "Нотўғри маълумот", ru: "Неверные данные", en: "Invalid data" },
  auErrInvalidEmail: { uz: "Noto'g'ri email", "uz-cyrl": "Нотўғри электрон почта", ru: "Неверный email", en: "Invalid email" },

  // ── Server (Supabase) xatolari ──
  auErrInvalidCreds: { uz: "Email yoki parol noto'g'ri.", "uz-cyrl": "Email ёки парол нотўғри.", ru: "Неверный email или пароль.", en: "Incorrect email or password." },
  auErrEmailNotConfirmed: {
    uz: "Email hali tasdiqlanmagan. Pochtangizdagi havolani bosing.",
    "uz-cyrl": "Email ҳали тасдиқланмаган. Почтангиздаги ҳаволани босинг.",
    ru: "Email ещё не подтверждён. Перейдите по ссылке из письма.",
    en: "Email not confirmed yet. Click the link in your inbox.",
  },
  auErrAlreadyRegistered: {
    uz: "Bu email allaqachon ro'yxatdan o'tgan. Kirishga harakat qiling.",
    "uz-cyrl": "Бу электрон почта аллақачон рўйхатдан ўтган. Киришга ҳаракат қилинг.",
    ru: "Этот email уже зарегистрирован. Попробуйте войти.",
    en: "This email is already registered. Try logging in.",
  },
  auErrWeakPassword: {
    uz: "Parol talablarga javob bermaydi.",
    "uz-cyrl": "Парол талабларга жавоб бермайди.",
    ru: "Пароль не соответствует требованиям.",
    en: "Password doesn't meet the requirements.",
  },
  auErrRateLimit: {
    uz: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Жуда кўп уриниш. Бироздан кейин қайта уриниб кўринг.",
    ru: "Слишком много попыток. Повторите чуть позже.",
    en: "Too many attempts. Please try again shortly.",
  },
  auErrProviderDisabled: {
    uz: "Bu kirish usuli hali yoqilmagan (Supabase → Auth → Providers).",
    "uz-cyrl": "Бу кириш усули ҳали ёқилмаган (Supabase → Auth → Providers).",
    ru: "Этот способ входа ещё не включён (Supabase → Auth → Providers).",
    en: "This sign-in method isn't enabled yet (Supabase → Auth → Providers).",
  },
  auErrNetwork: {
    uz: "Serverga ulanib bo'lmadi. Internetni tekshiring.",
    "uz-cyrl": "Серверга уланиб бўлмади. Интернетни текширинг.",
    ru: "Не удалось подключиться к серверу. Проверьте интернет.",
    en: "Couldn't reach the server. Check your internet connection.",
  },
  auErrExistsWrongPw: {
    uz: "Bu email allaqachon ro'yxatdan o'tgan, lekin parol mos kelmadi. Kirish sahifasidan urinib ko'ring.",
    "uz-cyrl": "Бу электрон почта аллақачон рўйхатдан ўтган, лекин парол мос келмади. Кириш саҳифасидан уриниб кўринг.",
    ru: "Этот email уже зарегистрирован, но пароль не подошёл. Попробуйте на странице входа.",
    en: "This email is already registered, but the password didn't match. Try the login page.",
  },
  auErrOAuthUrl: { uz: "OAuth havolasi olinmadi.", "uz-cyrl": "OAuth ҳаволаси олинмади.", ru: "Не удалось получить ссылку OAuth.", en: "Couldn't get the OAuth link." },
  auErrNoSession: { uz: "Sessiya yaratilmadi", "uz-cyrl": "Сессия яратилмади", ru: "Не удалось создать сессию", en: "Session could not be created" },
  auErrSignInCancelled: { uz: "Kirish bekor qilindi", "uz-cyrl": "Кириш бекор қилинди", ru: "Вход отменён", en: "Sign-in was cancelled" },
  auErrSupabaseMissing: {
    uz: "Supabase sozlanmagan: .env.local ichida NEXT_PUBLIC_SUPABASE_URL va NEXT_PUBLIC_SUPABASE_ANON_KEY ni to'ldiring (docs/SETUP.md).",
    "uz-cyrl": "Supabase созланмаган: .env.local ичида NEXT_PUBLIC_SUPABASE_URL ва NEXT_PUBLIC_SUPABASE_ANON_KEY ни тўлдиринг (docs/SETUP.md).",
    ru: "Supabase не настроен: заполните NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local (docs/SETUP.md).",
    en: "Supabase isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (docs/SETUP.md).",
  },

  // ── Onboarding ──
  auOnbMetaTitle: { uz: "Sozlash", "uz-cyrl": "Созлаш", ru: "Настройка", en: "Setup" },
  auOnbQuestion: { uz: "Savol", "uz-cyrl": "Савол", ru: "Вопрос", en: "Question" },
  auOnbAgeGroup: { uz: "Yosh guruhi", "uz-cyrl": "Ёш гуруҳи", ru: "Возрастная группа", en: "Age group" },
  auOnbCountrySearch: { uz: "Davlat qidirish", "uz-cyrl": "Давлат қидириш", ru: "Поиск страны", en: "Search country" },
  auOnbCountry: { uz: "Davlat", "uz-cyrl": "Давлат", ru: "Страна", en: "Country" },
  auOnbExperienceLevel: { uz: "Tajriba darajasi", "uz-cyrl": "Тажриба даражаси", ru: "Уровень опыта", en: "Experience level" },
  auOnbErrIncomplete: { uz: "Javoblar to'liq emas.", "uz-cyrl": "Жавоблар тўлиқ эмас.", ru: "Ответы заполнены не полностью.", en: "Your answers are incomplete." },
  auOnbErrNoSession: {
    uz: "Sessiya topilmadi. Qayta kiring.",
    "uz-cyrl": "Сессия топилмади. Қайта киринг.",
    ru: "Сессия не найдена. Войдите снова.",
    en: "Session not found. Please log in again.",
  },
  auOnbErrSave: { uz: "Saqlashda xato: {msg}", "uz-cyrl": "Сақлашда хато: {msg}", ru: "Ошибка сохранения: {msg}", en: "Save failed: {msg}" },

  // ── CLI ulash ──
  auCliMetaTitle: { uz: "CLI ulash", "uz-cyrl": "CLI улаш", ru: "Подключение CLI", en: "Connect CLI" },
  auCliConnected: { uz: "Ulandi!", "uz-cyrl": "Уланди!", ru: "Подключено!", en: "Connected!" },
  auCliConnectedDesc: {
    uz: "Terminalga qaytishingiz mumkin — SOVEREIGN CLI hisobingizga ulandi.",
    "uz-cyrl": "Терминалга қайтишингиз мумкин — SOVEREIGN CLI ҳисобингизга уланди.",
    ru: "Можете вернуться в терминал — SOVEREIGN CLI подключён к вашему аккаунту.",
    en: "You can return to the terminal — SOVEREIGN CLI is now connected to your account.",
  },
  auCliCanClose: { uz: "Bu oynani yopsangiz bo'ladi.", "uz-cyrl": "Бу ойнани ёпсангиз бўлади.", ru: "Это окно можно закрыть.", en: "You can close this window." },
  auCliDenied: { uz: "Rad etildi", "uz-cyrl": "Рад этилди", ru: "Отклонено", en: "Denied" },
  auCliDeniedDesc: {
    uz: "Ulanish bekor qilindi. Oynani yopishingiz mumkin.",
    "uz-cyrl": "Уланиш бекор қилинди. Ойнани ёпишингиз мумкин.",
    ru: "Подключение отменено. Окно можно закрыть.",
    en: "The connection was cancelled. You can close this window.",
  },
  auCliTitle: { uz: "SOVEREIGN CLI'ni ulash", "uz-cyrl": "SOVEREIGN CLI'ни улаш", ru: "Подключение SOVEREIGN CLI", en: "Connect SOVEREIGN CLI" },
  auCliRequest: {
    uz: "Terminaldagi SOVEREIGN CLI ushbu hisobga kirmoqchi:",
    "uz-cyrl": "Терминалдаги SOVEREIGN CLI ушбу ҳисобга кирмоқчи:",
    ru: "SOVEREIGN CLI в терминале хочет войти в этот аккаунт:",
    en: "SOVEREIGN CLI in your terminal wants to sign in to this account:",
  },
  auCliPlan: { uz: "{plan} tarif", "uz-cyrl": "{plan} тариф", ru: "Тариф {plan}", en: "{plan} plan" },
  auCliCode: { uz: "Kod", "uz-cyrl": "Код", ru: "Код", en: "Code" },
  auCliCancel: { uz: "Bekor qilish", "uz-cyrl": "Бекор қилиш", ru: "Отмена", en: "Cancel" },
  auCliConnecting: { uz: "Ulanmoqda…", "uz-cyrl": "Уланмоқда…", ru: "Подключение…", en: "Connecting…" },
  auCliAllow: { uz: "Ruxsat berish", "uz-cyrl": "Рухсат бериш", ru: "Разрешить", en: "Allow" },
  auCliWarning: {
    uz: "CLI kompyuteringizda kod yozadi va fayl yaratadi. Faqat o'zingiz ishga tushirgan bo'lsangiz ruxsat bering.",
    "uz-cyrl": "CLI компьютерингизда код ёзади ва файл яратади. Фақат ўзингиз ишга туширган бўлсангиз рухсат беринг.",
    ru: "CLI пишет код и создаёт файлы на вашем компьютере. Разрешайте, только если запустили его сами.",
    en: "The CLI writes code and creates files on your computer. Only allow it if you started it yourself.",
  },
  auCliErrBadCode: { uz: "Noto'g'ri kod", "uz-cyrl": "Нотўғри код", ru: "Неверный код", en: "Invalid code" },
  auCliErrNoSupabase: { uz: "Supabase sozlanmagan", "uz-cyrl": "Supabase созланмаган", ru: "Supabase не настроен", en: "Supabase isn't configured" },
  auCliErrLogin: { uz: "Avval SOVEREIGN'ga kiring", "uz-cyrl": "Аввал SOVEREIGN'га киринг", ru: "Сначала войдите в SOVEREIGN", en: "Log in to SOVEREIGN first" },
  auCliErrExpired: {
    uz: "Kod eskirgan yoki allaqachon ishlatilgan",
    "uz-cyrl": "Код эскирган ёки аллақачон ишлатилган",
    ru: "Код устарел или уже использован",
    en: "The code has expired or was already used",
  },
} satisfies Dict;

export type AuthKey = keyof typeof AUTH;

/** Matn AUTH lug'atidagi kalitmi (zod xabarlari / URL ?error= kalit bo'lib keladi). */
export function isAuthKey(v: unknown): v is AuthKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AUTH, v);
}

/** Supabase inglizcha xato matnini lug'at kalitiga moslaydi; mos kelmasa null. */
export function authErrorKey(message: string): AuthKey | null {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "auErrInvalidCreds";
  if (m.includes("email not confirmed")) return "auErrEmailNotConfirmed";
  if (m.includes("already registered") || m.includes("already been registered")) return "auErrAlreadyRegistered";
  // "Password is known to be weak and easy to guess" — sizib chiqqan parollar ro'yxati (HIBP).
  if (m.includes("password should be") || m.includes("weak and easy to guess") || m.includes("weak password"))
    return "auErrWeakPassword";
  // "For security purposes, you can only request this after 45 seconds." — takroriy xat so'rovi.
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes")) return "auErrRateLimit";
  if (m.includes("provider is not enabled")) return "auErrProviderDisabled";
  if (m.includes("fetch failed") || m.includes("network")) return "auErrNetwork";
  return null;
}
