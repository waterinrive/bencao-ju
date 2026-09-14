# 裁掉卡面图底部的内嵌药名标签：主体与标签之间通常有一段纯背景间隔，
# 在间隔中部下刀；无间隔（主体贴底）的图不动。一次性资产处理脚本。
import sys
from pathlib import Path
from PIL import Image

ART = Path('public/art')
BG = 232          # 通道全高于此值视为背景
ROW_INK = 0.004   # 行内非背景像素占比超过此值视为有墨


def row_ink(img) -> list[bool]:
    px = img.convert('RGB').load()
    w, h = img.size
    out = []
    for y in range(h):
        n = 0
        for x in range(0, w, 3):
            r, g, b = px[x, y]
            if min(r, g, b) < BG:
                n += 1
        out.append(n / (w / 3) > ROW_INK)
    return out


def trim(path: Path) -> str:
    img = Image.open(path)
    ink = row_ink(img)
    h = img.size[1]
    # 最底有墨行
    bottom = max((y for y in range(h) if ink[y]), default=-1)
    if bottom < 0:
        return 'empty'
    # 从 bottom 往上找标签带：先一段有墨（标签），再一段纯背景（间隔）
    label_top = bottom
    while label_top > 0 and ink[label_top - 1]:
        label_top -= 1
    if bottom - label_top > h * 0.25:
        return 'no-label-band'          # 底部墨带太高=主体贴底，不裁
    gap_end = label_top
    gap_start = gap_end
    while gap_start > h * 0.6 and not ink[gap_start - 1]:
        gap_start -= 1
    if gap_end - gap_start < 6:
        return 'no-gap'                 # 标签紧贴主体，不敢裁
    cut = (gap_start + gap_end) // 2
    img.crop((0, 0, img.size[0], cut)).save(path, quality=92)
    return f'cut {h}->{cut}'


for p in sorted(ART.glob('*.*')):
    if p.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
        continue
    print(p.name, trim(p))
