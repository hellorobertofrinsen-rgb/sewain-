import React from "react";
import { DocPage, DocSection } from "@/src/components/DocPage";
import { getLang, t } from "@/src/lib/i18n";

const SECTIONS: DocSection[] = [
  {
    h: "Layanan",
    p: [
      "SewAIn adalah aplikasi web untuk agen properti sewa: mencatat prospek, unit, tenant, viewing, kontrak, dan tagihan. SewAIn alat bantu administrasi; keputusan dan komunikasi dengan penyewa maupun pemilik tetap tanggung jawabmu.",
    ],
  },
  {
    h: "Akun",
    p: [
      "Satu akun untuk satu orang. Jaga kerahasiaan password-mu. Kamu bertanggung jawab atas aktivitas di akunmu dan atas kebenaran data yang kamu masukkan.",
    ],
  },
  {
    h: "Paket & pembayaran",
    p: [
      [
        "Akun baru mendapat Premium gratis selama 14 hari, tanpa kartu kredit.",
        "Setelah itu akun otomatis menjadi paket Free: 3 unit pertama tetap tampil dan 20 prospek aktif. Unit lainnya tidak dihapus, hanya disembunyikan sampai kamu upgrade.",
        "Premium: Rp277.000 per bulan atau Rp777.777 per 6 bulan, dibayar lewat transfer dan dikonfirmasi lewat WhatsApp. Tidak ada perpanjangan otomatis.",
        "Pembayaran yang sudah dikonfirmasi tidak dapat dikembalikan, kecuali layanan tidak bisa dipakai karena kesalahan kami.",
      ],
    ],
  },
  {
    h: "Penggunaan yang tidak diperbolehkan",
    p: [
      [
        "Menyimpan data orang lain tanpa dasar yang sah, atau untuk spam dan penipuan.",
        "Mencoba mengakses akun atau data milik orang lain.",
        "Mengganggu atau membebani layanan secara sengaja.",
      ],
      "Akun yang melanggar dapat kami hentikan.",
    ],
  },
  {
    h: "Ketersediaan & tanggung jawab",
    p: [
      "Kami berusaha agar SewAIn selalu bisa dipakai dan datamu dicadangkan setiap hari, tetapi layanan disediakan “sebagaimana adanya”. Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, seperti kehilangan komisi atau keuntungan, akibat gangguan layanan.",
    ],
  },
  {
    h: "Berhenti memakai",
    p: [
      "Kamu bisa berhenti kapan saja dan menghapus akun beserta seluruh datanya dari Pengaturan. Unduh datamu dulu bila masih diperlukan.",
    ],
  },
  {
    h: "Perubahan",
    p: [
      "Ketentuan ini bisa berubah. Perubahan penting akan kami umumkan di aplikasi sebelum berlaku. Hukum yang berlaku adalah hukum Republik Indonesia.",
    ],
  },
  { h: "Kontak", p: ["WhatsApp +62 821-2223-2421."] },
];

const SECTIONS_EN: DocSection[] = [
  {
    h: "The service",
    p: [
      "SewAIn is a web app for rental agents: it records prospects, units, tenants, viewings, contracts and bills. SewAIn is an admin tool; decisions and communication with renters and owners remain your responsibility.",
    ],
  },
  {
    h: "Your account",
    p: [
      "One account per person. Keep your password private. You're responsible for activity in your account and for the accuracy of the data you enter.",
    ],
  },
  {
    h: "Plans & payment",
    p: [
      [
        "New accounts get Premium free for 14 days, with no credit card.",
        "After that the account moves to the Free plan: your first 3 units stay visible, with 20 active prospects. Other units aren't deleted, just hidden until you upgrade.",
        "Premium: Rp277,000 per month or Rp777,777 per 6 months, paid by bank transfer and confirmed on WhatsApp. There's no automatic renewal.",
        "Confirmed payments can't be refunded, unless the service couldn't be used because of our error.",
      ],
    ],
  },
  {
    h: "What's not allowed",
    p: [
      [
        "Storing other people's data without a lawful basis, or for spam or fraud.",
        "Trying to access accounts or data that belong to someone else.",
        "Deliberately disrupting or overloading the service.",
      ],
      "We may suspend accounts that break these rules.",
    ],
  },
  {
    h: "Availability & liability",
    p: [
      "We work to keep SewAIn available and your data backed up every day, but the service is provided “as is”. As far as the law allows, we aren't liable for indirect losses, such as lost commission or profit, caused by service disruptions.",
    ],
  },
  {
    h: "Stopping",
    p: [
      "You can stop any time and delete your account and all its data from Settings. Download your data first if you still need it.",
    ],
  },
  {
    h: "Changes",
    p: [
      "These terms may change. We'll announce important changes in the app before they take effect. These terms are governed by the laws of the Republic of Indonesia.",
    ],
  },
  { h: "Contact", p: ["WhatsApp +62 821-2223-2421."] },
];

export default function Ketentuan() {
  const en = getLang() === "en";
  return (
    <DocPage
      title={t("Ketentuan Layanan")}
      updated="26 September 2026"
      intro={en ? "By creating an account or using SewAIn, you agree to the following terms." : "Dengan membuat akun atau memakai SewAIn, kamu setuju dengan ketentuan berikut."}
      sections={en ? SECTIONS_EN : SECTIONS}
      testID="terms-page"
    />
  );
}
