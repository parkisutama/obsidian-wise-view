# Gantt Beta

Gantt Beta menampilkan note Bases sebagai jadwal berjenjang. Wise View tidak menentukan nama
properti atau alur kerja Anda: pilih sendiri properti frontmatter yang akan menjadi tanggal,
label, fase, urutan, progres, warna, dan dependensi.

## Mulai dari konfigurasi minimum

Untuk sekadar menampilkan bar, Anda hanya perlu memilih **Start date**. Pilih **End date** bila
durasi note lebih dari satu hari dan **Label** bila teks pada bar tidak ingin memakai nama file.

```yaml
---
mulai: 2026-09-18
selesai: 2026-09-20
nama_jadwal: Menyusun prototipe
---
```

Di pengaturan Gantt Beta, petakan `mulai` ke **Start date**, `selesai` ke **End date**, dan
`nama_jadwal` ke **Label**. Nama properti tersebut hanya contoh; Anda bebas memakai nama lain.

## Jika ingin X, atur Y

| Tujuan | Konfigurasi | Catatan |
| --- | --- | --- |
| Menampilkan note sebagai bar | **Start date** | Ini satu-satunya pemetaan yang wajib. Note tanpa start yang valid belum masuk chart. |
| Menampilkan durasi tertentu | **Start date** + **End date** | End untuk nilai Date bersifat inklusif. Jika kosong, Gantt membuat durasi tampilan bawaan. |
| Mengganti nama pada bar | **Label** | Jika kosong, nama file dipakai. |
| Membuat fase dan subtask | **Parent (phase)** + aktifkan **Phases** | Isi Parent dengan link ke note induk, misalnya `[[Fondasi]]`. |
| Mengurutkan anak dalam fase | **Order** + aktifkan **Phases** | Gunakan angka. Order membandingkan note yang berada dalam parent/group yang sama. |
| Menampilkan persentase selesai | **Progress** + aktifkan **Show progress** | Nilai dinormalisasi ke rentang 0–100. |
| Mewarnai menurut kategori | **Color by** | Pilih properti seperti status, tim, atau kategori. Warna mengikuti konfigurasi warna Wise View/Pretty Properties. |
| Menampilkan hubungan antar-task | **Depends on** | Task ini mulai setelah semua task yang ditautkan selesai. Garis chart menjadi bahasa utamanya. |
| Membuat fase dari kategori Bases | **Group by** bawaan Bases + **Phases** | Group by bukan properti Gantt. Ia membuat fase tingkat teratas dari hasil query Bases. |
| Melihat lebih banyak ruang chart | Nonaktifkan **Task list** atau **Detail panel** | **Row numbers**, **Tooltip**, dan **Row height** hanya mengubah presentasi. |
| Memilih tingkat waktu | **Scale** | Day/Week untuk jadwal rinci; Month/Quarter/Year untuk gambaran yang lebih panjang. |

## Hubungan antar-konfigurasi

Gunakan ringkasan ini saat lupa opsi mana yang menjadi prasyarat:

| Konfigurasi utama | Konfigurasi yang bergantung padanya |
| --- | --- |
| **Start date** | End date, bar pada chart, serta seluruh interaksi tanggal di tahap write. |
| **Parent (phase)** | Phases untuk menampilkan hierarchy; Order untuk mengurutkan saudara; Write phase dates di tahap write. |
| **Progress** | Show progress menentukan apakah nilai divisualkan; Edit progress akan menentukan apakah nilainya boleh ditulis. |
| **Depends on** | Draw/Delete dependencies menulis relasi; When predecessor moves menentukan apakah tanggal penerus boleh ikut ditulis. |
| **Working weekdays** + **Holidays** | Show non-working days menentukan visibilitas; Snap to working days akan memengaruhi penempatan saat edit. |
| **Create by drawing** | Template note, Target folder, dan Title format menentukan note baru yang dibuat. |

Aturan sederhananya: opsi dalam **Properties** memilih sumber data; **Layout** menentukan apa yang
terlihat; **Timeline** menentukan cara waktu disajikan; **Editing** menentukan apa yang kelak boleh
ditulis; dan **Note template** hanya relevan ketika pembuatan note dari chart diaktifkan.

## Contoh fase dan task

Misalnya note `Fondasi.md` menjadi parent bagi dua task:

```yaml
# Preact runtime.md
---
mulai: 2026-09-18
selesai: 2026-09-19
fase: "[[Fondasi]]"
urutan: 10
progres: 100
status: Selesai
---
```

```yaml
# View skeleton.md
---
mulai: 2026-09-20
selesai: 2026-09-22
fase: "[[Fondasi]]"
urutan: 20
progres: 60
status: Berjalan
bergantung_pada:
  - "[[Preact runtime]]"
---
```

Gunakan pemetaan berikut:

- `mulai` → **Start date**
- `selesai` → **End date**
- `fase` → **Parent (phase)**
- `urutan` → **Order**
- `progres` → **Progress**
- `status` → **Color by**
- `bergantung_pada` → **Depends on**

Fase sintetis akan memakai rentang gabungan anak-anaknya. Parent eksternal yang tidak termasuk
hasil Base tetap dapat tampil sebagai fase sintetis. Jika Bases juga memakai Group by, hierarchy
Parent tetap berada di dalam group task tersebut; parent lintas group sengaja diabaikan agar pohon
tidak ambigu.

## Dependensi tanpa menghafal FS/SS/FF/SF

Pilih satu properti link atau list of links sebagai **Depends on**. Hubungan disimpan pada note
yang bergantung, sedangkan link menunjuk note pendahulu.

```yaml
# Riset.md
---
start: 2026-10-01
end: 2026-10-03
---
```

```yaml
# Implementasi.md
---
start: 2026-10-04
end: 2026-10-08
depends_on:
  - "[[Riset]]"
  - "[[Persetujuan desain]]"
---
```

Petakan `depends_on` ke **Depends on**. Artinya `Implementasi` tidak boleh mulai sebelum seluruh
pendahulunya selesai (finish-to-start/FS). Setelah editing aktif, hubungan yang sama dibuat dengan
menarik garis dari akhir bar pendahulu ke awal bar penerus; pengguna tidak perlu mengetik `FS`.

Pilih perilaku **When predecessor moves** sesuai kebutuhan:

| Pilihan | Efek |
| --- | --- |
| **Do not shift automatically** | Garis hanya memberi informasi. Tanggal note lain tidak ditulis. |
| **Shift only when dates overlap** | Penerus digeser secukupnya ketika mulai sebelum pendahulu selesai. Jarak yang masih valid boleh mengecil. |
| **Shift and maintain time between tasks** | Penerus mengikuti delta pergeseran pendahulu sehingga jarak tetap sama. |

Kedua mode yang menggeser selalu mempertahankan durasi task penerus. Pergeseran dapat merambat ke
rantai berikutnya, tetapi tidak mengubah progress. Link yang tidak dapat ditemukan tetap tersimpan
di frontmatter dan tidak digambar.

FS, SS, FF, dan SF adalah istilah analisis jadwal yang berguna untuk perangkat manajemen proyek
lanjutan. Gantt Beta v1 sengaja memakai FS sebagai kontrak tunggal yang mudah dipahami. Critical
path, slack, atau pelanggaran dependency nantinya merupakan informasi yang dihitung dari garis dan
tanggal—bukan teks yang harus ditambahkan pengguna ke setiap note.

## Timeline dan hari kerja

- **Working weekdays** memakai angka `0` sampai `6`: Minggu = `0`, Senin = `1`, sampai Sabtu = `6`.
  Nilai bawaan `1,2,3,4,5` berarti Senin–Jumat.
- **Holidays** berupa daftar tanggal ISO yang dipisahkan koma, misalnya
  `2026-01-01, 2026-12-25`.
- **First day of week** memakai penomoran yang sama; `1` berarti Senin.
- **Scroll to today on open** membuka chart di sekitar hari ini.
- **Zoom with Ctrl/Cmd + wheel** dan **Infinite scroll** mengubah cara navigasi chart.

Nilai Date harus berbentuk `YYYY-MM-DD`. Datetime memakai ISO, misalnya
`2026-09-18T09:30`. Nilai dengan offset atau `Z` dibaca dan ditampilkan dalam waktu lokal.
Datetime dapat menempatkan awal/akhir bar pada jam tertentu dan scale **Day** menampilkan tick
jam. Namun Gantt Beta belum menawarkan scale Hour/Quarter day/Half day; pilihan scale resminya
tetap Day, Week, Month, Quarter, dan Year.

## Status fitur Beta saat ini

Pemetaan baca saat ini sudah mencakup tanggal, label, Parent, Order, progress, warna, dependensi,
Group by, fase sintetis, serta opsi tampilan/timeline yang diteruskan ke chart.

Gantt Beta saat ini tetap dipaksa **read-only** selama write path dikerjakan. Karena itu opsi
**Move bars**, **Resize bars**, **Edit progress**, **Draw/Delete dependencies**, **Reorder rows**,
**Create by drawing**, **When predecessor moves**, **Snap to working days**, **Write phase dates**,
dan bagian **Note template** belum menjadi janji perilaku aktif. Opsi tersebut sudah terlihat agar
kontrak konfigurasi stabil, tetapi baru boleh diandalkan setelah task implementasi write terkait
selesai dan diterima.

Tanggal yang berasal dari formula akan tetap tidak dapat digeser atau di-resize, bahkan setelah
editing aktif, karena formula adalah sumber kebenarannya.

Untuk kontrak teknis lengkap, lihat [spesifikasi Gantt Beta](specs/gantt-beta.md).
