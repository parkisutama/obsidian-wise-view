# Gantt Beta native acceptance

Catatan ini memisahkan bukti runtime Obsidian dari hasil tes otomatis.

## Read path — desktop

Tanggal uji: 2026-09-19

Penguji: maintainer

Tema: light dan dark

| Area | Hasil | Catatan |
| --- | --- | --- |
| Start dan End | Lulus | Date dan Date & time tampil sebagai rentang. |
| Parent (phase) | Lulus | Hierarchy property Parent tampil dan dapat di-collapse. |
| Group by Bases | Lulus | Group native menjadi fase tingkat atas bersama hierarchy Parent. |
| Progress | Lulus dengan catatan | Nilai terbaca dan tooltip menunjukkan persentase, tetapi fill kurang terlihat pada sebagian warna. |
| Color by | Lulus | Warna kategori diterapkan pada bar; kontras progress bergantung pada warna. |
| Ctrl/Cmd + wheel | Lulus dengan catatan | Scale berubah, tetapi belum ada indikator/picker scale yang terlihat dan tersinkron. |
| Today marker | Gagal | Pada 2026-09-20 sebelum 07.00 WIB marker menunjuk 2026-09-19 karena library memakai UTC. GBETA-016 harus menggantinya dengan marker tanggal lokal. |
| Tooltip | Perlu perbaikan | Tooltip library dan tooltip lain dapat bertumpuk saat hover. |
| Detail panel | Parsial sesuai tahap | Panel library muncul; renderer detail Wise View belum diimplementasikan. |
| Move/resize/dependency drawing | Belum diuji | View masih sengaja dipaksa read-only sampai GBETA-009–GBETA-011 selesai. |

## Follow-up yang diterima

- Toolbar harus menampilkan scale aktif dan picker harus ikut berubah setelah zoom dengan
  Ctrl/Cmd + wheel.
- Progress fill harus tetap terbaca pada warna kategori terang maupun gelap.
- Hover tidak boleh menampilkan dua tooltip yang saling menumpuk.
- Dependency harus memakai satu properti Depends on dan garis chart; pengguna tidak perlu
  menghafal atau menulis FS/SS/FF/SF.

## Write path

Tanggal persiapan: 2026-09-20

Build yang diuji: `eb907d9` (`008b09d` untuk core cascade)

Status preflight otomatis:

- `main.js`, `manifest.json`, dan `styles.css` berhasil dibangun dan diverifikasi.
- Gate repository lulus: 41 file tes / 417 tes, typecheck, Biome, dan ESLint.
- Bukti di bawah tetap harus berasal dari Obsidian desktop. Host Codex saat persiapan tidak
  menyediakan akses aplikasi native, sehingga hasil manual sengaja tidak diasumsikan.

### Fixture minimum

Gunakan tiga note biasa dan dua phase note. Nama properti boleh berbeda; petakan melalui
Configure view.

```yaml
# Phase A.md
start: 2026-10-01
end: 2026-10-06

# Phase B.md
start: 2026-10-07
end: 2026-10-12

# Task A.md
start: 2026-10-01
end: 2026-10-02
parent: "[[Phase A]]"
order: 10
progress: 25
depends_on: []

# Task B.md
start: 2026-10-04
end: 2026-10-05
parent: "[[Phase A]]"
order: 20
progress: 0
depends_on: []

# Task C.md
start: 2026-10-08
end: 2026-10-09
parent: "[[Phase B]]"
order: 10
progress: 0
depends_on: []
```

Konfigurasi awal: Start=`start`, End=`end`, Parent=`parent`, Order=`order`,
Progress=`progress`, Depends on=`depends_on`; Read only=off; seluruh izin editing=on;
When predecessor moves=`Do not shift automatically`; Write phase dates=off.

### Checklist §3.4

Catat `Lulus`, `Gagal`, atau `Terhalang` beserta nilai frontmatter aktual. Reload view setelah
setiap baris agar hasil sebelumnya tidak menyamarkan hasil berikutnya.

| Area | Langkah dan hasil yang diharapkan | Hasil | Catatan/bukti |
| --- | --- | --- | --- |
| Move | Geser Task A satu hari. Start dan End maju satu hari; durasi tetap. | Belum diuji | |
| Resize | Tarik ujung kanan Task A satu hari. Hanya End bertambah satu hari. | Belum diuji | |
| Progress | Tarik progress Task A. `progress` menjadi integer yang terlihat pada chart. | Belum diuji | |
| Summary drag | Geser bar Phase A. Task A dan B ikut bergeser; tanggal Phase A tidak ditulis karena Write phase dates=off. | Belum diuji | |
| Dependency create | Tarik dari endpoint akhir Task A ke endpoint awal Task B. Tepat satu `[[Task A]]` ditambahkan ke `depends_on` Task B dan satu garis tampil. | Belum diuji | |
| Dependency reject | Coba endpoint selain end-to-start. Gesture ditolak dan frontmatter tidak berubah. | Belum diuji | |
| Dependency delete | Pilih/hapus garis A→B. Hanya link Task A di `depends_on` Task B yang hilang. | Belum diuji | |
| Reparent | Pindahkan Task B dari Phase A ke Phase B. `parent` menjadi `[[Phase B]]`. Drop ke group sintetis harus ditolak. | Belum diuji | |
| Reorder | Tukar urutan Task A/B dalam phase. `order` sibling menjadi 10, 20; tanpa property Order gesture harus ditolak. | Belum diuji | |
| Create | Gambar range di area create. Note baru dibuat melalui template dengan Start/End terisi; Parent memang belum diisi karena draft library tidak membawa row target. | Belum diuji | |
| Detail edit | Ubah tanggal/progress dari panel detail bawaan. Jalur write sama seperti move/progress. | Belum diuji | |
| Echo state | Setelah write sukses, horizontal scroll, phase collapse, selection, dan detail panel tetap pada state sebelumnya. | Belum diuji | |
| Failure revert | Dengan target property formula/tidak writable, write menampilkan Notice dan chart kembali ke nilai sebelumnya. | Belum diuji | |

### Checklist dependency schedule dan phase dates

| Mode | Langkah dan hasil yang diharapkan | Hasil | Catatan/bukti |
| --- | --- | --- | --- |
| None | Dengan A→B, geser A melewati awal B. B tidak bergeser; garis memperlihatkan konflik. | Belum diuji | |
| Overlap | Pilih Shift only when dates overlap lalu geser A melewati awal B. B maju minimum sampai start B = end A dan durasi B tetap. | Belum diuji | |
| Maintain gap | Pilih Shift and maintain time lalu geser A dua hari. B dan successor berikutnya maju dua hari; seluruh durasi tetap. | Belum diuji | |
| Phase dates off | Geser descendant. Bar phase roll-up berubah, tetapi frontmatter phase tidak berubah. | Belum diuji | |
| Phase dates on | Aktifkan Write phase dates dan geser descendant. Start/End phase ditulis sesuai roll-up. Ulangi pada phase Date & time untuk memastikan jam tidak hilang. | Belum diuji | |

### Persetujuan maintainer

- [ ] Seluruh kegagalan/penyimpangan di atas sudah dicatat.
- [ ] Maintainer menyetujui Gate 2 dan GBETA-012 dapat ditutup.
