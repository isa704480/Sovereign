import { permanentRedirect } from "next/navigation";

/** /pricing — narxlar landingning #pricing bo'limida (tashqi havolalar uchun doimiy yo'naltirish). */
export default function PricingPage() {
  permanentRedirect("/#pricing");
}
