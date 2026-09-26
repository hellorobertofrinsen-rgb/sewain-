import React from "react";
import { DocPage, DocSection } from "@/src/components/DocPage";
import { getLang, t } from "@/src/lib/i18n";

// Written to match what the code actually does (see backend/). Update it whenever
// data handling changes.
const SECTIONS: DocSection[] = [
  {
    h: "Data yang kami simpan",
    p: [
      [
        "Akun: nama, email, dan password (disimpan dalam bentuk hash bcrypt, tidak bisa dibaca siapa pun).",
        "Data kerja yang kamu masukkan: unit (termasuk nama & nomor owner), prospek (nama, nomor WhatsApp, preferensi), tenant, kontrak, tagihan, booking, to-do, foto unit, dan foto profil/prospek/tenant yang kamu unggah. Profilmu: nomor telepon, agensi, domisili, dan rekening yang kamu isi untuk invoice.",
        "Catatan aktivitas di akunmu (mis. “follow-up dikirim”), untuk riwayat dan laporan.",
      ],
      "Kami tidak memakai cookie iklan, tidak memasang pelacak pihak ketiga, dan tidak membaca isi WhatsApp-mu. Pesan WhatsApp dikirim dari aplikasi WhatsApp di HP-mu sendiri.",
    ],
  },
  {
    h: "Untuk apa data dipakai",
    p: [
      "Hanya untuk menjalankan SewAIn untukmu: menampilkan Home, mencocokkan prospek dengan unit, membuat tagihan, dan menghitung laporan. Tidak ada pemrosesan AI, tidak dijual, dan tidak dibagikan ke pihak lain untuk pemasaran.",
    ],
  },
  {
    h: "Data orang lain yang kamu catat",
    p: [
      "Nama dan nomor prospek, tenant, dan pemilik unit adalah data pribadi mereka. Dalam hal ini kamu adalah pengendali data (sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi) dan SewAIn memprosesnya atas namamu. Catat hanya yang perlu untuk urusan sewa, dan hapus bila orangnya meminta.",
    ],
  },
  {
    h: "Di mana data disimpan dan siapa yang bisa melihat",
    p: [
      "Aplikasi berjalan di server cloud dan database dikelola penyedia cloud pihak ketiga. Koneksi selalu terenkripsi (HTTPS). Setiap akun hanya bisa melihat datanya sendiri. Pengelola SewAIn hanya mengakses akun untuk urusan teknis atau saat kamu minta bantuan.",
      "Salinan cadangan database dibuat setiap hari dan disimpan paling lama 14 hari.",
    ],
  },
  {
    h: "Berapa lama disimpan",
    p: [
      [
        "Selama akunmu aktif.",
        "Akun demo beserta isinya dihapus otomatis setelah 7 hari.",
        "Saat kamu menghapus akun, semua data langsung dihapus dari database utama, dan ikut hilang dari cadangan paling lambat 14 hari kemudian.",
      ],
    ],
  },
  {
    h: "Hak kamu",
    p: [
      [
        "Melihat dan memperbaiki datamu kapan saja di aplikasi.",
        "Mengunduh datamu (Pengaturan → Export data).",
        "Menghapus akun dan seluruh isinya (Pengaturan → Hapus akun & semua data).",
      ],
    ],
  },
  {
    h: "Keamanan",
    p: [
      "Password di-hash, percobaan masuk dibatasi untuk mencegah tebak-tebakan password, dan mengganti password otomatis mengeluarkan perangkat lain. Tidak ada sistem yang 100% aman; kalau terjadi kebocoran yang menyangkut datamu, kami akan memberi tahu secepatnya.",
    ],
  },
  {
    h: "Kontak",
    p: ["Pertanyaan atau permintaan soal data: WhatsApp +62 821-2223-2421."],
  },
];

const SECTIONS_EN: DocSection[] = [
  {
    h: "What we store",
    p: [
      [
        "Your account: name, email and password (stored as a bcrypt hash that no one can read).",
        "The work data you enter: units (including the owner's name and number), prospects (name, WhatsApp number, preferences), tenants, contracts, bills, bookings, to-dos, unit photos, and any profile, prospect or tenant photos you upload. Your profile: phone number, agency, where you're based, and the bank accounts you add for invoices.",
        "An activity log for your account (e.g. “follow-up sent”), for history and reports.",
      ],
      "We don't use advertising cookies, don't install third-party trackers, and don't read your WhatsApp. WhatsApp messages are sent from the WhatsApp app on your own phone.",
    ],
  },
  {
    h: "What we use it for",
    p: [
      "Only to run SewAIn for you: showing Home, matching prospects with units, creating bills and calculating reports. There's no AI processing, and nothing is sold or shared with anyone for marketing.",
    ],
  },
  {
    h: "Other people's data you record",
    p: [
      "The names and numbers of prospects, tenants and unit owners are their personal data. For this data you are the data controller (under Indonesia's Personal Data Protection Law, No. 27 of 2022) and SewAIn processes it on your behalf. Only record what you need for the rental, and delete it if the person asks.",
    ],
  },
  {
    h: "Where the data is stored and who can see it",
    p: [
      "The app runs on cloud servers and the database is managed by a third-party cloud provider. Connections are always encrypted (HTTPS). Each account can only see its own data. SewAIn's operators only access an account for technical reasons or when you ask for help.",
      "Database backups are made every day and kept for at most 14 days.",
    ],
  },
  {
    h: "How long we keep it",
    p: [
      [
        "For as long as your account is active.",
        "Demo accounts and their contents are deleted automatically after 7 days.",
        "When you delete your account, all its data is removed from the main database straight away, and disappears from backups within 14 days.",
      ],
    ],
  },
  {
    h: "Your rights",
    p: [
      [
        "See and correct your data any time in the app.",
        "Download your data (Settings → Export data).",
        "Delete your account and everything in it (Settings → Delete account & all data).",
      ],
    ],
  },
  {
    h: "Security",
    p: [
      "Passwords are hashed, sign-in attempts are limited to stop password guessing, and changing your password signs out your other devices. No system is 100% secure; if a breach ever affects your data, we'll tell you as soon as possible.",
    ],
  },
  {
    h: "Contact",
    p: ["Questions or requests about your data: WhatsApp +62 821-2223-2421."],
  },
];

export default function Privasi() {
  const en = getLang() === "en";
  return (
    <DocPage
      title={t("Kebijakan Privasi")}
      updated="26 September 2026"
      intro={en ? "SewAIn helps agents manage prospects, units and tenants. This page explains what data is stored, what it's for, and your rights." : "SewAIn membantu agen mengelola prospek, unit, dan tenant. Halaman ini menjelaskan data apa yang disimpan, untuk apa, dan apa hakmu."}
      sections={en ? SECTIONS_EN : SECTIONS}
      testID="privacy-page"
    />
  );
}
