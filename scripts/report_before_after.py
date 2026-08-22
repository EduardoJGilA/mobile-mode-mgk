#!/usr/bin/env python3
import os
import sys
from pathlib import Path
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

data_dir = Path('/mnt/storage/foundryuserdata/Data')
orig_exts = {'.png', '.jpg', '.jpeg'}

pairs = []
total_orig_bytes = 0
total_webp_bytes = 0

print("🔍 Analizando almacenamiento...", flush=True)

for root, _, files in os.walk(data_dir):
    for f in files:
        if f.startswith('.'):
            continue
        p = Path(root) / f
        if p.suffix.lower() in orig_exts:
            webp_p = p.with_suffix('.webp')
            if webp_p.exists():
                try:
                    orig_s = p.stat().st_size
                    webp_s = webp_p.stat().st_size
                    total_orig_bytes += orig_s
                    total_webp_bytes += webp_s
                    pairs.append((p, webp_p, orig_s, webp_s))
                except OSError:
                    pass

pairs.sort(key=lambda x: x[2], reverse=True)

print("\n" + "=" * 70, flush=True)
print("📊 RESUMEN GLOBAL: ANTES VS DESPUÉS", flush=True)
print("=" * 70, flush=True)
print(f"🖼️  Total de imágenes optimizadas a WebP: {len(pairs):,} archivos", flush=True)
print(f"💾 Peso Original (PNG/JPG):  {total_orig_bytes / (1024*1024*1024):.2f} GB ({total_orig_bytes / (1024*1024):,.1f} MB)", flush=True)
print(f"📦 Peso Optimizado (WebP):   {total_webp_bytes / (1024*1024*1024):.2f} GB ({total_webp_bytes / (1024*1024):,.1f} MB)", flush=True)
saved = total_orig_bytes - total_webp_bytes
pct = (saved / total_orig_bytes) * 100 if total_orig_bytes > 0 else 0
print(f"🚀 AHORRO TOTAL REAL:        {saved / (1024*1024*1024):.2f} GB ({saved / (1024*1024):,.1f} MB) -> Reducción del {pct:.1f}%", flush=True)
print("=" * 70 + "\n", flush=True)

print("🏆 TOP 15 MAPAS MÁS PESADOS (Detalle de resolución y proporciones):", flush=True)
print("-" * 70, flush=True)

for i, (orig, webp, s1, s2) in enumerate(pairs[:15], 1):
    name = orig.name
    mb1 = s1 / (1024 * 1024)
    mb2 = s2 / (1024 * 1024)
    p_saved = ((s1 - s2) / s1) * 100
    try:
        with Image.open(orig) as im1, Image.open(webp) as im2:
            w1, h1 = im1.size
            w2, h2 = im2.size
            ratio1 = round(w1 / h1, 3)
            ratio2 = round(w2 / h2, 3)
            status = "✅ Paredes/Grid exactas" if ratio1 == ratio2 else f"⚠️ Ratio: {ratio1} vs {ratio2}"
            print(f"{i:2d}. {name[:32]:<32} | {w1}x{h1} ➔ {w2}x{h2} | {mb1:5.1f}MB ➔ {mb2:4.1f}MB (-{p_saved:4.1f}%) | {status}", flush=True)
    except Exception:
        print(f"{i:2d}. {name[:32]:<32} | {mb1:5.1f}MB ➔ {mb2:4.1f}MB (-{p_saved:4.1f}%)", flush=True)

print("-" * 70 + "\n", flush=True)
