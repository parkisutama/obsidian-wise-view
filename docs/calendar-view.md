# Calendar View

Calendar View menampilkan item dari Obsidian Bases dalam kalender interaktif berbasis
[FullCalendar](https://fullcalendar.io/). View ini membaca properti frontmatter yang sudah ada di
note, lalu memetakannya menjadi event kalender tanpa memaksakan workflow task tertentu.

## Ringkasan fitur

- Menampilkan note berdasarkan properti tanggal dari Bases.
- Mendukung tampilan Year, Month, Week, 3-day, Day, dan List.
- Membuka note dari event kalender dengan sekali klik.
- Mengubah tanggal event lewat drag-and-drop atau resize, jika properti tanggal dapat ditulis.
- Membuat note/event baru dari slot waktu pada tampilan Week, 3-day, atau Day.
- Membuka journal atau daily note dari tanggal kalender.
- Mendukung hover preview Obsidian untuk event dan journal/daily note yang sudah ada.
- Mewarnai event berdasarkan properti pilihan, Pretty Properties, atau konfigurasi `valueStyles`.
- Menyesuaikan awal minggu, ukuran teks, default view, dan tinggi baris Year view.

## Cara menggunakan

1. Buka folder sebagai Obsidian Base.
2. Ubah tipe view Bases menjadi **Calendar**.
3. Buka pengaturan view Calendar di Bases.
4. Pilih properti tanggal pada **Date start field**.
5. Opsional: pilih **Date end field**, **Title field**, dan **Color by**.

Minimal, setiap note yang ingin muncul di kalender harus punya nilai pada properti yang dipilih
sebagai **Date start field**.

Contoh frontmatter:

```yaml
---
title: Website redesign
status: In progress
priority: High
date_start: 2026-03-01T09:00:00+07:00
date_end: 2026-03-01T11:00:00+07:00
---
```

Untuk event sepanjang hari, gunakan tanggal tanpa waktu:

```yaml
---
title: Launch day
date_start: 2026-03-15
date_end: 2026-03-16
---
```

## Pemetaan data

Calendar View menggunakan konfigurasi berikut dari view Bases:

| Opsi | Fungsi |
| --- | --- |
| **Date start field** | Properti tanggal mulai. Wajib agar note tampil sebagai event. |
| **Date end field** | Properti tanggal selesai. Opsional untuk event berdurasi atau multi-day. |
| **Title field** | Properti teks yang dipakai sebagai judul event. Default: `note.title`. |
| **Color by** | Properti kategori yang menentukan warna event. |
| **Default view** | Tampilan awal saat Calendar dibuka. |
| **Week starts on** | Hari pertama dalam minggu. |
| **Font size** | Ukuran teks event dan label kalender. |
| **Year view row height** | Tinggi sel kalender untuk mode Year continuous dan split. |

Jika **Title field** kosong atau nilainya tidak tersedia, Calendar memakai nama file sebagai fallback.

## Mode tampilan

Toolbar Calendar menyediakan beberapa mode:

| Tombol | Tampilan |
| --- | --- |
| **Y** | Year view. Bisa ditukar antara split by month dan continuous scroll. |
| **M** | Month view. |
| **W** | Week view. |
| **3** | 3-day view. |
| **D** | Day view. |
| **L** | Weekly list view. |

Tombol refresh memuat ulang data kalender. Tombol today membawa kalender kembali ke tanggal hari ini.

## Interaksi event

- Klik event untuk membuka note di tab baru.
- Hover event untuk memicu Page Preview Obsidian, mengikuti pengaturan Page Preview pengguna.
- Klik kanan event untuk membuka menu lokasi file, seperti open in new tab, open to the right, open
  above, open below, open to the left, dan open in new window.
- Drag event untuk memindahkan tanggal mulai dan selesai.
- Resize event untuk mengubah durasi.

Perubahan drag dan resize ditulis kembali ke frontmatter melalui `app.fileManager.processFrontMatter`.
Calendar tidak menulis ke properti `file.*` atau `formula.*` karena properti tersebut tidak dapat
diedit langsung sebagai frontmatter.

## Membuat note dari kalender

Calendar dapat membuat note baru dari seleksi waktu pada tampilan Week, 3-day, dan Day.

Saat pengguna memilih slot waktu:

1. Calendar membuat frontmatter berdasarkan **Date start field** dan **Date end field**.
2. Jika event bukan all-day, tanggal ditulis sebagai ISO lokal dengan offset timezone.
3. Jika event all-day, tanggal ditulis sebagai `YYYY-MM-DD`.
4. Note dibuat lewat Bases, atau langsung ke folder target jika **Target folder** diisi.

Opsi **Note template**:

| Opsi | Fungsi |
| --- | --- |
| **Template note** | File markdown yang dipakai sebagai template isi note. |
| **Target folder** | Folder tujuan. Jika kosong, Calendar mengikuti perilaku pembuatan file dari Bases. |
| **Title format** | Format nama file note baru. Default: `Event {{date}} {{time}}`. |

Token template yang didukung:

| Token | Isi |
| --- | --- |
| `{{title}}` | Judul default dari event baru. |
| `{{date}}` | Tanggal mulai, format `YYYY-MM-DD`. |
| `{{time}}` | Waktu mulai, format `HH:mm`. |
| `{{start}}` | Tanggal mulai lengkap. |
| `{{end}}` | Tanggal selesai lengkap. |

Frontmatter dari template akan digabung dengan frontmatter event. Nilai tanggal dari event menang
jika ada kunci yang sama.

## Integrasi journal dan daily note

Tanggal pada kalender dapat diklik untuk membuka journal atau daily note:

- Jika plugin Obsidian Journal tersedia dan punya journal bertipe day, Calendar memakai journal itu.
- Jika tidak, Calendar memakai core Daily Notes.
- Jika Daily Notes tidak aktif, Calendar memakai fallback `YYYY-MM-DD.md` di root vault.

Jika daily note belum ada, Calendar dapat membuatnya dan menerapkan template Daily Notes jika
terkonfigurasi. Tanggal yang sudah punya journal/daily note ditandai dengan dot kecil pada Month dan
Year view.

## Pewarnaan event

Calendar memilih warna event dengan urutan berikut:

1. Jika **Color by** mengarah ke properti `color`, nilai hex dari note dipakai langsung.
2. Jika Pretty Properties aktif dan punya warna untuk nilai properti tersebut, warna itu dipakai.
3. Jika ada konfigurasi `valueStyles` untuk field dan nilai tersebut, warna itu dipakai.
4. Jika tidak ada konfigurasi khusus, Calendar membuat warna stabil dari nilai teks.
5. Jika **Color by** kosong atau `none`, Calendar memakai warna fallback abu-abu.

Teks event otomatis memakai hitam atau putih berdasarkan kontras warna background.

## Pengaturan default plugin

Default global Calendar tersedia di pengaturan Wise View:

- **Week starts on**
- **Font size**

Default lain, seperti field tanggal, warna, dan default view, disimpan di `data.json` plugin dan
dipakai sebagai fallback saat opsi tersebut belum diatur pada file `.base`.

## Batasan

- Calendar hanya menampilkan item yang punya **Date start field**.
- Pembuatan note dari seleksi tanggal hanya aktif di Week, 3-day, dan Day view.
- Drag dan resize tidak berlaku untuk properti `file.*` atau `formula.*`.
- Calendar tidak menghitung dependency, recurrence, hierarchy, atau status otomatis.
- Calendar tidak memaksakan schema frontmatter tertentu.
