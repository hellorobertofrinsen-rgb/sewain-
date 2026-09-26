import React from "react";
import { DocPage, DocSection } from "@/src/components/DocPage";

// Written to match what the code actually does (see backend/). Update it whenever
// data handling changes.
const SECTIONS: DocSection[] = [
  {
    h: "Data yang kami simpan",
    p: [
      [
        "Akun: nama, email, dan password (disimpan dalam bentuk hash bcrypt, tidak bisa dibaca siapa pun).",
        "Data kerja yang kamu masukkan: properti, unit (termasuk nama & nomor pemilik), prospek (nama, nomor WhatsApp, budget, kebutuhan, catatan), tenant, kontrak, tagihan, laporan masalah, dan foto unit.",
        "Catatan aktivitas di akunmu (mis. “follow-up dikirim”), untuk riwayat dan laporan.",
      ],
      "Kami tidak memakai cookie iklan, tidak memasang pelacak pihak ketiga, dan tidak membaca isi WhatsApp-mu. Pesan WhatsApp dikirim dari aplikasi WhatsApp di HP-mu sendiri.",
    ],
  },
  {
    h: "Untuk apa data dipakai",
    p: [
      "Hanya untuk menjalankan Sewain untukmu: menampilkan antrean Hari Ini, mencocokkan prospek dengan unit, membuat tagihan, dan menghitung laporan. Tidak ada pemrosesan AI, tidak dijual, dan tidak dibagikan ke pihak lain untuk pemasaran.",
    ],
  },
  {
    h: "Data orang lain yang kamu catat",
    p: [
      "Nama dan nomor prospek, tenant, dan pemilik unit adalah data pribadi mereka. Dalam hal ini kamu adalah pengendali data (sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi) dan Sewain memprosesnya atas namamu. Catat hanya yang perlu untuk urusan sewa, dan hapus bila orangnya meminta.",
    ],
  },
  {
    h: "Di mana data disimpan dan siapa yang bisa melihat",
    p: [
      "Aplikasi berjalan di server cloud dan database dikelola penyedia cloud pihak ketiga. Koneksi selalu terenkripsi (HTTPS). Setiap akun hanya bisa melihat datanya sendiri. Pengelola Sewain hanya mengakses akun untuk urusan teknis atau saat kamu minta bantuan.",
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

export default function Privasi() {
  return (
    <DocPage
      title="Kebijakan Privasi"
      updated="26 September 2026"
      intro="Sewain membantu agen mengelola prospek, unit, dan tenant. Halaman ini menjelaskan data apa yang disimpan, untuk apa, dan apa hakmu."
      sections={SECTIONS}
      testID="privacy-page"
    />
  );
}
