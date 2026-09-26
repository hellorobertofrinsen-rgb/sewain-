import React from "react";
import { DocPage, DocSection } from "@/src/components/DocPage";

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

export default function Ketentuan() {
  return (
    <DocPage
      title="Ketentuan Layanan"
      updated="26 September 2026"
      intro="Dengan membuat akun atau memakai SewAIn, kamu setuju dengan ketentuan berikut."
      sections={SECTIONS}
      testID="terms-page"
    />
  );
}
