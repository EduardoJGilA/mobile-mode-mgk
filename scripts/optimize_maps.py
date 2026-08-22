#!/usr/bin/env python3
"""
Optimizador de Imágenes y Mapas de Foundry VTT para Raspberry Pi.
- Convierte y comprime imágenes pesadas a formato WebP manteniendo la nitidez (calidad 85 por defecto).
- Si una imagen excede el límite máximo (4096px por defecto), la redimensiona manteniendo la proporción exacta (las paredes en Foundry NO se mueven).
- Diseñado para bajo consumo de RAM y alta velocidad en procesadores ARM (Raspberry Pi).
"""

import os
import sys
import argparse
import time
from pathlib import Path
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif'}

def format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"

def optimize_image(file_path, max_dim=4096, quality=85, replace_original=False, min_size_kb=300):
    path = Path(file_path)
    if not path.is_file():
        return None

    ext = path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS and ext != '.webp':
        return None

    try:
        out_path = path.with_suffix('.webp')
        orig_size = path.stat().st_size

        # Skip if already converted to webp in previous run
        if ext != '.webp' and out_path.exists() and out_path.stat().st_size > 0:
            if out_path.stat().st_mtime >= path.stat().st_mtime:
                return None

        # Skip tiny files that don't need optimization
        if ext == '.webp' and orig_size < min_size_kb * 1024:
            return None

        with Image.open(path) as img:
            w, h = img.size
            longest = max(w, h)
            needs_downscale = longest > max_dim

            # If it's already a webp and within dimension limit, skip
            if ext == '.webp' and not needs_downscale:
                return None

            # Calculate new dimensions keeping exact aspect ratio (preserves wall alignment in Foundry)
            if needs_downscale:
                scale = max_dim / longest
                new_w = max(1, round(w * scale))
                new_h = max(1, round(h * scale))
                resample_filter = getattr(Image, 'Resampling', Image).LANCZOS
                resized_img = img.resize((new_w, new_h), resample=resample_filter)
            else:
                new_w, new_h = w, h
                resized_img = img.copy()

            out_path = path.with_suffix('.webp')

            # Ensure proper color mode
            if resized_img.mode not in ('RGB', 'RGBA'):
                if 'A' in resized_img.mode:
                    resized_img = resized_img.convert('RGBA')
                else:
                    resized_img = resized_img.convert('RGB')

            # Save temporary file first to prevent corruption
            tmp_out = out_path.with_name(f".tmp_opt_{out_path.name}")
            resized_img.save(tmp_out, 'WEBP', quality=quality, method=4)
            new_size = tmp_out.stat().st_size

            # If the new file is not smaller and no dimension change, discard
            if new_size >= orig_size and not needs_downscale and ext == '.webp':
                if tmp_out.exists():
                    tmp_out.unlink()
                return None

            # Replace atomically
            if tmp_out.exists():
                tmp_out.replace(out_path)

            saved_bytes = orig_size - new_size
            return {
                "path": str(path),
                "out_path": str(out_path),
                "orig_w": w,
                "orig_h": h,
                "new_w": new_w,
                "new_h": new_h,
                "orig_size": orig_size,
                "new_size": new_size,
                "saved_bytes": saved_bytes
            }

    except Exception as e:
        return {"path": str(path), "error": str(e)}

def scan_and_optimize(target_dir, max_dim=4096, quality=85, min_size_kb=300):
    target_path = Path(target_dir).resolve()
    if not target_path.exists():
        print(f"❌ La ruta no existe: {target_path}")
        return

    print(f"\n🔍 Escaneando archivos en: {target_path}")
    print(f"⚙️  Configuración: Límite máx: {max_dim}px | Calidad WebP: {quality}% | Mínimo: {min_size_kb}KB\n")

    files_to_process = []
    for root, _, files in os.walk(target_path):
        for f in files:
            if f.startswith('.'):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in SUPPORTED_EXTENSIONS or ext == '.webp':
                full_p = os.path.join(root, f)
                try:
                    if os.path.getsize(full_p) >= min_size_kb * 1024:
                        files_to_process.append(full_p)
                except OSError:
                    pass

    total_files = len(files_to_process)
    print(f"📊 Se encontraron {total_files} imágenes candidatas a optimizar.\n")
    if total_files == 0:
        print("✅ Todo está en orden, no hay imágenes pesadas para procesar.")
        return

    total_orig = 0
    total_new = 0
    optimized_count = 0
    start_time = time.time()

    for idx, f_path in enumerate(files_to_process, 1):
        rel_name = os.path.relpath(f_path, target_path)
        res = optimize_image(f_path, max_dim=max_dim, quality=quality, min_size_kb=min_size_kb)
        if res:
            if "error" in res:
                print(f"[{idx}/{total_files}] ⚠️ Error en {rel_name}: {res['error']}", flush=True)
            else:
                optimized_count += 1
                total_orig += res["orig_size"]
                total_new += res["new_size"]
                dim_str = f"{res['orig_w']}x{res['orig_h']} ➔ {res['new_w']}x{res['new_h']}" if res['orig_w'] != res['new_w'] else f"{res['orig_w']}x{res['orig_h']}"
                saved_pct = (res['saved_bytes'] / res['orig_size']) * 100 if res['orig_size'] > 0 else 0
                print(f"[{idx}/{total_files}] ✨ {rel_name}", flush=True)
                print(f"         📐 {dim_str} | 📦 {format_size(res['orig_size'])} ➔ {format_size(res['new_size'])} (-{saved_pct:.1f}%)\n", flush=True)
        else:
            # skipped (already optimal)
            pass

    elapsed = time.time() - start_time
    saved_total = total_orig - total_new

    print("=" * 60, flush=True)
    print(f"🎉 ¡OPTIMIZACIÓN FINALIZADA EN {elapsed:.1f} segundos!", flush=True)
    print(f"🖼️  Imágenes procesadas y optimizadas: {optimized_count} de {total_files}", flush=True)
    if total_orig > 0:
        print(f"💾 Tamaño original total: {format_size(total_orig)}", flush=True)
        print(f"📦 Tamaño final total:    {format_size(total_new)}", flush=True)
        print(f"🚀 Espacio total ahorrado: {format_size(saved_total)} (Reducción del {(saved_total/total_orig)*100:.1f}%)", flush=True)
    print("=" * 60 + "\n", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Optimizador de mapas e imágenes para Foundry VTT en Raspberry Pi")
    parser.add_argument("path", nargs="?", default="/mnt/storage/foundryuserdata/Data/assets", help="Ruta de la carpeta de imágenes o Data de Foundry")
    parser.add_argument("--max", type=int, default=4096, help="Dimensión máxima en px (lado más largo, defecto: 4096)")
    parser.add_argument("--quality", type=int, default=85, help="Calidad WebP 1-100 (defecto: 85)")
    parser.add_argument("--min-size", type=int, default=300, help="Tamaño mínimo en KB para optimizar (defecto: 300)")

    args = parser.parse_args()
    scan_and_optimize(args.path, max_dim=args.max, quality=args.quality, min_size_kb=args.min_size)
