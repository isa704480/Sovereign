import { redirect } from "next/navigation";

/**
 * /cli — alohida sahifa yo'q (faqat /cli/connect va /cli/sessions). Eski havolalar va "soveregn.xyz/cli"
 * deb yozganlar hujjatlarning CLI bo'limiga tushadi. Subdomainlar yoqilganda proxy.ts buni bitta
 * sakrash bilan docs.<domen>/#cli ga yo'naltiradi; bu sahifa — qolgan holatlar uchun.
 */
export default function CliIndexPage() {
  redirect("/docs#cli");
}
