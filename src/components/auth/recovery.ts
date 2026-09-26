/**
 * Parolni tiklash oqimi: emaildagi havola /auth/callback?flow=recovery ga keladi,
 * callback sessiya ochib shu httpOnly cookie'ni qo'yadi va /reset-password ga yuboradi.
 * Yangi parolni saqlash (updatePassword) faqat shu cookie bor bo'lsa ishlaydi —
 * oddiy kirgan sessiya (yoki o'g'irlangan cookie) parolni jimgina almashtira olmaydi.
 */
export const RECOVERY_COOKIE = "sov-recovery";
/** Tiklash oynasi: 15 daqiqa. */
export const RECOVERY_MAX_AGE = 15 * 60;
export const RESET_PASSWORD_PATH = "/reset-password";
