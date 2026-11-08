<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → About as "What's new". Short bullets only — this comment is not shown.
-->

**New: drag a file onto the bud**
- **Convert anything, offline:** Hold a file over the bud and the ring opens with what that file can become, plus tools for it. Drop it on a petal and the result lands next to the original (never overwriting: `photo (1).jpg`). Or drop it on the bud itself to browse every option first. Nothing is uploaded; FFmpeg, the background-removal model and the PDF engines ship inside Bloom.
- **Formats:** images (PNG, JPG, WebP, AVIF, ICO, TIFF, BMP, GIF, plus HEIC and TIFF in), PDF (to PNG, JPG, TXT, DOCX), documents (DOCX, Markdown, TXT, CSV, HTML to PDF, DOCX, HTML, TXT), audio and video (MP3, WAV, FLAC, OGG, M4A; MP4, WebM, MKV, GIF).
- **Tools:** Remove Background, Compress (by quality or target size), quick crop ratios, resize, rotate, flip, black & white, strip location or all metadata; video Compress, 720p and Mute; PDF Split, Compress, Rotate, Password (AES-256), Extract images, Strip metadata.
- **Several files at once:** combine images into one PDF, merge PDFs, or convert or compress a whole batch.
- **Undo and feedback:** each result says what changed (`2.4 MB → 610 KB`), and right-click the bud → **Undo last conversion** moves it to the trash.

**New: Studio, an image and PDF editor**
- **Studio petal:** a default petal on the ring (added to existing rings once), also reachable from any file's own Studio folder. Opens with nothing too, ready for a drop or Open…
- **Images:** Crop (free or locked ratios), Edit (light, colour, Auto, compare), Add BG (gradients, padding, corners, shadow), Annotate (arrows, boxes, steps, text, marker), Redact (black, blur, pixelate), Resize, Compress, and Info (EXIF and GPS, with a map link).
- **PDF page editor:** drag pages to reorder, rotate, delete, duplicate, add pages from other PDFs or images (or drag files onto the grid), and save everything or just the selected pages.

**Settings and website**
- **File tools settings:** a new section in General & Startup: where results go (beside the original or a Bloom folder), image quality, and PDF to image resolution.
- **Website:** a new Files section with a live file-ring demo, an interactive Studio preview and the PDF page editor.

**Bug Fixes**
- **Bud accepts drags on KDE Wayland:** the bud is now a normal window that never takes focus, instead of an override-redirect one that KWin skipped for drags from native apps.
