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

Belum dimulai. Isi bagian ini saat GBETA-012 dijalankan.
