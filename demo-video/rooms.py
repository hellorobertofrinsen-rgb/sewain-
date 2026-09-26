"""Flat-style room illustrations for the demo units (no photo hosts reachable here)."""
import os
from PIL import Image, ImageDraw, ImageFilter
import random
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
PALETTES = [
    # wall, floor, accent, bed, rug
    ('#EDE6DC', '#C9A77C', '#2457D6', '#FFFFFF', '#D8C3A5'),
    ('#E4ECF5', '#B08D6A', '#1E3A8A', '#F8F5F0', '#9FB4D6'),
    ('#F1ECE4', '#8C6A4F', '#C26A3D', '#FFFDF8', '#E3C9A8'),
    ('#E7EFE9', '#BFA284', '#3F7D5A', '#FBFBF7', '#B9D3C2'),
    ('#EEE9F3', '#A98A6B', '#6D4AD6', '#FFFFFF', '#CFC3E6'),
    ('#F4EFE7', '#9C7B5B', '#2F4858', '#FFFFFF', '#D9CDBD'),
]

def room(i, w=1200, h=800):
    wall, floor, accent, bed, rug = PALETTES[i % len(PALETTES)]
    r = random.Random(i)
    im = Image.new('RGB', (w, h), wall)
    d = ImageDraw.Draw(im)
    fy = int(h * 0.68)
    d.rectangle([0, fy, w, h], fill=floor)
    for x in range(0, w, 90):  # floor boards
        d.line([x, fy, x - 60, h], fill=tuple(max(0, c - 18) for c in im.getpixel((5, fy + 5))), width=2)
    # window with city light
    wx, wy, ww, wh = int(w * 0.56), int(h * 0.12), int(w * 0.32), int(h * 0.38)
    d.rounded_rectangle([wx - 10, wy - 10, wx + ww + 10, wy + wh + 10], 14, fill='#FFFFFF')
    sky = Image.new('RGB', (ww, wh))
    sd = ImageDraw.Draw(sky)
    for y in range(wh):
        t = y / wh
        sd.line([0, y, ww, y], fill=(int(170 + 60 * t), int(205 + 30 * t), int(240 + 10 * t)))
    for k in range(9):  # skyline
        bx = r.randint(0, ww - 40); bh = r.randint(wh // 4, wh // 2)
        sd.rectangle([bx, wh - bh, bx + r.randint(30, 60), wh], fill=(150, 170, 200))
    im.paste(sky, (wx, wy))
    d.line([wx + ww // 2, wy, wx + ww // 2, wy + wh], fill='#FFFFFF', width=8)
    # curtain
    d.rounded_rectangle([wx - 40, wy - 30, wx - 5, fy - 20], 10, fill=rug)
    # bed
    bx, by = int(w * 0.06), int(h * 0.46)
    d.rounded_rectangle([bx, by - 70, bx + 60, fy + 40], 16, fill=accent)  # headboard
    d.rounded_rectangle([bx + 20, by, bx + int(w * 0.46), fy + 70], 26, fill=bed)
    d.rounded_rectangle([bx + 20, by + 60, bx + int(w * 0.46), fy + 70], 26, fill=rug)
    d.rounded_rectangle([bx + 50, by + 12, bx + 170, by + 58], 18, fill='#FFFFFF', outline='#E6E0D8', width=3)
    # side table + lamp
    tx = bx + int(w * 0.48)
    d.rounded_rectangle([tx, fy - 90, tx + 90, fy + 30], 10, fill=floor)
    d.polygon([(tx + 20, fy - 180), (tx + 70, fy - 180), (tx + 85, fy - 120), (tx + 5, fy - 120)], fill='#FFF3D6')
    d.line([tx + 45, fy - 120, tx + 45, fy - 90], fill='#6B5B4B', width=5)
    # plant
    px = int(w * 0.9)
    d.rounded_rectangle([px - 35, fy - 60, px + 35, fy + 20], 12, fill='#FFFFFF')
    for k in range(7):
        a = r.randint(-60, 60)
        d.ellipse([px - 30 + a // 2, fy - 170 + k * 12, px + 30 + a // 2, fy - 110 + k * 12], fill='#5E8C61')
    # framed art
    d.rounded_rectangle([int(w * 0.18), int(h * 0.14), int(w * 0.36), int(h * 0.32)], 8, fill='#FFFFFF')
    d.ellipse([int(w * 0.22), int(h * 0.17), int(w * 0.30), int(h * 0.29)], fill=accent)
    im = im.filter(ImageFilter.SMOOTH)
    im.save(f'{OUT}room{i}.jpg', quality=88)

os.makedirs(OUT, exist_ok=True)
for i in range(12):
    room(i)
print('ok')
