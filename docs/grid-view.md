# Grid View

Grid View menampilkan note Obsidian Bases sebagai kartu (card) dalam grid responsif berbasis
kolom. View ini memakai properti yang Anda pilih sendiri dan tidak mengharuskan schema task
tertentu; tanpa konfigurasi apa pun, Grid tetap menampilkan satu kartu per note memakai nama
file sebagai judul.

## Cara menggunakan

1. Buka folder sebagai Obsidian Base.
2. Pilih tipe view **Grid**.
3. Opsional: buka pengaturan view dan pilih **Title**, **Subtitle**, **Cover**, **Tags**,
   **Color by**, dan **Group by**.
4. Atur **Minimum card width** dan **Gap** sesuai kepadatan yang diinginkan.
5. Properti yang dipilih pada menu Properties bawaan Bases (toolbar "Properties") tampil sebagai
   badge pada setiap kartu, dalam urutan yang sama.

## Pemetaan properti

| Opsi | Fungsi |
| --- | --- |
| **Title** | Judul kartu. Kosong atau tidak tersedia memakai nama file. |
| **Subtitle** | Baris kedua di bawah judul. Kosong berarti tidak ditampilkan. |
| **Cover** | Gambar sampul. Menerima path vault, wikilink, atau URL eksternal. |
| **Tags** | Daftar tag (properti list) atau nilai tunggal, ditampilkan sebagai chip. |
| **Color by** | Nilai kategori yang dipetakan melalui color resolver bersama; menentukan warna
  border kartu, bukan warna latar penuh. |
| **Group by** | Membagi kartu menjadi section dengan header yang bisa di-collapse. Kosong berarti
  tidak ada header group buatan. |
| **Minimum card width** | Lebar minimum satu kolom (120–400px); jumlah kolom menyesuaikan lebar
  panel secara otomatis. |
| **Gap** | Jarak antar kartu (0–32px). |

## Interaksi

- Klik atau tekan Enter/Space pada kartu untuk membuka note.
- Modifier Obsidian pada klik tetap menentukan tab, split, atau window tujuan.
- Hover mengikuti Page Preview Obsidian.
- Klik kanan membuka menu lokasi file bersama Wise View.
- Klik heading group untuk collapse atau expand; identitas kartu (path) tetap stabil saat
  di-expand kembali.

Grid bersifat **read-only**: tidak ada aksi popup, tidak ada penulisan status/priority/group, dan
tidak ada mutasi apa pun ke frontmatter.

## Kumpulan besar

Hanya kartu dalam batch pertama yang dirender penuh secara sinkron; sisanya dipasang bertahap
lintas beberapa animation frame agar Base besar tidak memblokir thread utama saat pertama kali
dibuka.

## Perbedaan dari referensi upstream

Konsep kartu (slot judul/subtitle/cover/tags/properti, identitas berbasis path, tanpa retensi
`BasesEntry`) mengambil bukti desain dari proyek Dynamic Views
([churnish/dynamic-views](https://github.com/churnish/dynamic-views), GPL-3.0-or-later, commit
`7af74541825440bdb581023b0f795b41190c6817`) sebagaimana dicatat di
`docs/architecture/upstream-provenance.md`. Implementasi Grid saat ini ditulis dari bukti desain
dan pola Wise View sendiri, bukan port langsung dari berkas upstream tertentu — belum ada baris
provenance per-berkas yang tercatat untuk Grid.

Wise View **tidak** mengadopsi dari Dynamic Views:

- urutan status/priority workflow atau schema task apa pun;
- penulisan checkbox, pembersihan `.base` otomatis, thumbnail jaringan, image viewer/slideshow;
- kerangka pengaturan (settings framework) yang luas;
- ketergantungan pada API khusus Obsidian 1.13.

## Batas verifikasi

Tes otomatis membuktikan mapping properti, tata letak kolom, batch mounting untuk kumpulan
besar, urutan group/path sesuai urutan Bases, fast path render untuk update identik, collapse
group, interaksi, dan cleanup lifecycle. Tes tersebut bukan pengganti native visual acceptance
di Obsidian desktop, mobile, atau popout window.
