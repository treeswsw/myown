#!/usr/bin/env python3
"""갱스껄 조각 그림 자르기.

입력  design/gsk/ref/ref-7-user-final.webp (1536x1024, 사용자 그림)
출력  client/src/gsk/img/  (disc-*.png, mat-*.png, floor-tile.webp, floor.webp, meta.json)

실행: python3 scripts/gsk-cut.py [--x1] [--out 폴더]
  기본은 조각을 2배(Lanczos + 약한 선명화, 256색 PNG)로 만든다. --x1 은 원본 해상도.
같은 입력이면 항상 같은 출력(난수는 고정 seed).
조각 위치는 아래 표(원본에서 직접 잰 값)를 쓴다.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design/gsk/ref/ref-7-user-final.webp')

# ---- 잰 좌표 (원본 픽셀) -------------------------------------------------
# 원판: (cx, cy, r) 줄 0..5 = 초록 보라 노랑 빨강 파랑 주황. r 은 바깥 가장자리 반지름.
DISCS = {
    'back':   [(592, 143.5, 73.2), (592, 297.6, 73.5), (592, 448.7, 73.2),
               (592, 601.8, 73.5), (592, 756.9, 73.5), (592, 917.0, 73.5)],
    'flower': [(1297, 144.5, 70.5), (1297, 298.6, 70.0), (1297, 449.7, 71.0),
               (1297, 602.8, 70.5), (1298, 758.9, 71.0), (1298, 918.0, 71.0)],
    'skull':  [(1446, 145.5, 67.5), (1446, 299.6, 67.0), (1446, 449.7, 67.5),
               (1446, 602.8, 67.5), (1447, 754.9, 67.0), (1446, 918.0, 67.5)],
}
# 개인판: 가로 x0..x1(포함 안 함), 줄별 y0..y1
TILE_X = {'front': (73, 229), 'back': (260, 416)}
TILE_Y = [(71, 214), (225, 367), (377, 519), (530, 673), (683, 828), (844, 989)]
TILE_W, TILE_H, TILE_R = 156, 143, 10  # 출력 크기와 둥근 모서리 반지름(원본 px)

DISC_N = 150        # 원판 이미지 한 변(원본 해상도 기준)
DISC_R = 74.0       # 원판 반지름(모든 원판을 같은 크기로 맞춘다)
INSET = 1.2         # 가장자리 그림자·나무가 섞이지 않게 안쪽으로 줄이는 양(원본 px)
FEATHER = 1.4       # 가장자리 부드러움

# 바닥으로 쓰는 깨끗한 나무 부분(글씨·조각·옹이 없음)
WOOD_BOX = (690, 490, 1200, 850)


def disc_alpha(n, r_cut, feather):
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.hypot(xx + 0.5 - n / 2, yy + 0.5 - n / 2)
    return np.clip((r_cut - d) / feather + 0.5, 0, 1)


def with_alpha(rgb, a):
    out = rgb.convert('RGBA')
    out.putalpha(Image.fromarray((a * 255 + 0.5).astype(np.uint8)))
    return out


def save_png(im, path, k):
    if k > 1:  # 2배는 256색으로 줄여 한 장 60KB 아래로
        im = im.quantize(256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    im.save(path, optimize=True)


def sharpen(img, k):
    if k <= 1:
        return img
    return img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=2))


def cut_disc(src, cx, cy, r, k):
    s = DISC_R / r                      # 원본 -> 출력(원본 해상도 기준) 배율
    n = DISC_N * k
    half = DISC_N / 2 / s
    box = (cx - half, cy - half, cx + half, cy + half)
    im = src.resize((n, n), Image.LANCZOS, box=box)
    im = sharpen(im, k)
    a = disc_alpha(n, (DISC_R - INSET * s) * k, FEATHER * k)
    return with_alpha(im, a)


def round_rect_alpha(w, h, rad, feather):
    ss = 8
    big = np.zeros((h * ss, w * ss), np.float32)
    yy, xx = np.mgrid[0:h * ss, 0:w * ss]
    X = (xx + 0.5) / ss
    Y = (yy + 0.5) / ss
    inset = 0.9  # 가장자리 그림자 안 섞이게
    cxl, cxr, cyt, cyb = rad, w - rad, rad, h - rad
    dx = np.maximum(np.maximum(cxl - X, X - cxr), 0)
    dy = np.maximum(np.maximum(cyt - Y, Y - cyb), 0)
    d = np.hypot(dx, dy)
    inside = (d <= rad - inset) & (X >= inset) & (X <= w - inset) & (Y >= inset) & (Y <= h - inset)
    big = inside.astype(np.float32)
    a = big.reshape(h, ss, w, ss).mean((1, 3))
    return a


def cut_tile(src, side, row, k):
    x0, x1 = TILE_X[side]
    y0, y1 = TILE_Y[row]
    w, h = TILE_W * k, TILE_H * k
    im = src.resize((w, h), Image.LANCZOS, box=(x0, y0, x1, y1))
    im = sharpen(im, k)
    a = round_rect_alpha(w, h, TILE_R * k, FEATHER * k)
    return with_alpha(im, a)


def measure_hole(im):
    """원판 가운데 원(테두리 띠 안쪽). 가장 어두운 얇은 선의 반지름을 이미지 크기 비율로 잰다."""
    L = np.asarray(im.convert('RGBA')).astype(float)[..., :3].mean(2)
    n = im.width
    c = n / 2
    t = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    def ring(r):
        return L[(c + r * np.sin(t)).astype(int), (c + r * np.cos(t)).astype(int)].mean()
    dark = min((ring(r), r) for r in np.arange(0.34 * n, 0.42 * n, 0.5))
    return {'cx': 0.5, 'cy': 0.5, 'r': round(dark[1] / n - 0.004, 4)}


def smoothstep(t):
    return t * t * (3 - 2 * t)


def seamless(patch, ov_x, ov_y):
    """가로·세로로 이음매 없이 이어지는 타일. 끝부분을 처음 부분과 섞는다."""
    p = np.asarray(patch).astype(np.float32)
    H, W = p.shape[:2]
    tw, th = W - ov_x, H - ov_y
    # 가로
    t = p.copy()
    for x in range(ov_x):
        a = smoothstep(x / ov_x)
        t[:, x] = (1 - a) * p[:, tw + x] + a * p[:, x]
    t = t[:, :tw]
    # 세로
    u = t.copy()
    for y in range(ov_y):
        a = smoothstep(y / ov_y)
        u[y] = (1 - a) * t[th + y] + a * t[y]
    u = u[:th]
    return Image.fromarray(np.clip(u + 0.5, 0, 255).astype(np.uint8))


def make_floor(tile, w=1920, h=1080, seed=11):
    rng = np.random.default_rng(seed)
    t = np.asarray(tile)
    th, tw = t.shape[:2]
    rows = []
    nrow = -(-h // th)
    for i in range(nrow):
        row = t[::-1] if i % 2 else t   # 한 줄씩 위아래를 뒤집어 반복이 덜 보이게
        row = np.roll(row, int(rng.integers(0, tw)), axis=1)  # 가로는 아무 데로 밀어도 이어진다
        rows.append(np.tile(row, (1, -(-w // tw) + 1, 1))[:, :w])
    big = np.concatenate(rows, 0)[:h]
    return Image.fromarray(big)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--x1', action='store_true')
    ap.add_argument('--out', default=os.path.join(ROOT, 'client/src/gsk/img'))
    args = ap.parse_args()
    k = 1 if args.x1 else 2
    os.makedirs(args.out, exist_ok=True)
    src = Image.open(SRC).convert('RGB')

    meta = {'skullHole': [], 'flowerHole': [], 'discSize': DISC_N, 'matSize': [TILE_W, TILE_H]}
    for kind, key in (('back', 'back'), ('flower', 'flower'), ('skull', 'skull')):
        for c, (cx, cy, r) in enumerate(DISCS[key]):
            im = cut_disc(src, cx, cy, r, k)
            if kind in ('skull', 'flower'):
                meta[kind + 'Hole'].append(measure_hole(im))
            save_png(im, os.path.join(args.out, f'disc-{kind}-{c}.png'), k)
    for side in ('front', 'back'):
        for c in range(6):
            im = cut_tile(src, side, c, k)
            save_png(im, os.path.join(args.out, f'mat-{side}-{c}.png'), k)

    with open(os.path.join(args.out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    wood = src.crop(WOOD_BOX)
    tile = seamless(wood, 110, 80)
    tile.save(os.path.join(args.out, 'floor-tile.webp'), quality=88, method=6)
    floor = make_floor(tile)
    floor.save(os.path.join(args.out, 'floor.webp'), quality=82, method=6)
    print('ok', 'x1' if args.x1 else 'x2', tile.size)


if __name__ == '__main__':
    main()
