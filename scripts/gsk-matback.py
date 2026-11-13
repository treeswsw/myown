#!/usr/bin/env python3
"""갱스껄 개인판 뒷면(1점 면)을 "흑백 고급판"으로 다시 칠한다.

입력  design/gsk/shots/mat-back-old/mat-back-{0..5}.png  (gsk-cut.py 가 만든 옛 뒷면. 없으면 지금 img 의 것을 먼저 보관)
출력  client/src/gsk/img/mat-back-{0..5}.png  (같은 크기·같은 투명 모양, 256색 PNG)
      design/gsk/shots/mat-back-compare.png   (--compare: 앞면 · 옛 뒷면 · 새 뒷면 비교)

실행: python3 scripts/gsk-matback.py [--compare]
방법: 문양의 모양(선)은 그대로 두고 색만 바꾼다.
  - 밝기(가장 밝은 채널과 휘도의 섞음)를 재서 어두운 곳은 깊은 검정, 밝은 선은 크림·흰색으로.
  - 포인트(그 사람 색)는 위치 마스크로 남긴다: 네 모서리 둥근 장식 + 가운데 꽃심.
  - 투명 바깥·둥근 모서리(알파)는 손대지 않는다.
난수 없음. 같은 입력이면 항상 같은 출력. gsk-cut.py 를 다시 돌렸다면 옛 뒷면 폴더를 지우고 이 스크립트를 돌린다.
"""
import os, shutil, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'client/src/gsk/img')
OLD = os.path.join(ROOT, 'design/gsk/shots/mat-back-old')
SHOT = os.path.join(ROOT, 'design/gsk/shots/mat-back-compare.png')

BLACK = np.array([13, 11, 10], np.float32)      # 바탕
CREAM = np.array([236, 226, 205], np.float32)   # 문양 중간 밝기
WHITE = np.array([255, 251, 242], np.float32)   # 문양 가장 밝은 선

W, H = 312, 286
# 네 모서리 둥근 장식(중심, 반지름). 6장 모두 같은 자리.
CORNERS = [(37.5, 35.5), (274.5, 35.5), (37.5, 250.5), (274.5, 250.5)]
CORNER_R = 23.0
# 줄 0..5 = 초록 보라 노랑 빨강 파랑 주황.
#   core: 가운데 꽃심 반지름(px), tint: 포인트에 입힐 그 사람 색, lo/hi: 밝기 자르는 점, gamma: 클수록 면이 어두워지고 선만 남는다
TILES = [
    dict(core=13, tint=(96, 214, 72),  lo=0.26, hi=0.80, gamma=1.3),
    dict(core=14, tint=(176, 84, 240), lo=0.30, hi=0.66, gamma=1.2),
    dict(core=27, tint=(255, 196, 30), lo=0.30, hi=0.88, gamma=1.6),
    dict(core=19, tint=(236, 30, 30),  lo=0.34, hi=0.72, gamma=1.5),
    dict(core=14, tint=(30, 180, 235), lo=0.28, hi=0.76, gamma=1.4),
    dict(core=25, tint=(255, 130, 24), lo=0.30, hi=0.86, gamma=1.6),
]


def disc(cx, cy, r, feather=1.6):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    return np.clip((r - d) / feather + 0.5, 0, 1)


def repaint(old, cfg):
    px = np.asarray(old.convert('RGBA')).astype(np.float32)
    rgb, a = px[..., :3] / 255.0, px[..., 3]
    luma = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    v = 0.6 * rgb.max(2) + 0.4 * luma
    t = np.clip((v - cfg['lo']) / (cfg['hi'] - cfg['lo']), 0, 1)
    t = t * t * (3 - 2 * t)                    # 대비를 세게(검정은 더 검게, 선은 더 밝게)
    t = t ** cfg['gamma']
    # 흑백: 검정 -> 크림 -> 흰색
    k = t[..., None]
    mono = np.where(k < 0.7, BLACK + (CREAM - BLACK) * (k / 0.7), CREAM + (WHITE - CREAM) * ((k - 0.7) / 0.3))
    # 포인트: 같은 밝기 그림에 그 사람 색을 입힌다(검정 -> 색 -> 밝은 색)
    tint = np.array(cfg['tint'], np.float32)
    hot = tint + (255 - tint) * 0.16         # 너무 하얗게 뜨지 않게(빨강이 분홍이 되지 않게)
    tc = np.clip(t * 1.1, 0, 1)[..., None]
    col = np.where(tc < 0.75, BLACK + (tint - BLACK) * (tc / 0.75), tint + (hot - tint) * ((tc - 0.75) / 0.25))
    m = disc(W / 2, H / 2, cfg['core'])
    for cx, cy in CORNERS:
        m = np.maximum(m, disc(cx, cy, CORNER_R))
    m = m[..., None]
    out = mono * (1 - m) + col * m
    res = np.dstack([np.clip(out + 0.5, 0, 255), a]).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


def save_png(im, path):
    q = im.quantize(256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    q.save(path, optimize=True)


def compare():
    """6색 x (앞면 · 옛 뒷면 · 새 뒷면) 을 나무 바닥 위에. 위는 큰 크기, 아래는 실제처럼 작은 크기(폭 120px)."""
    floor = Image.open(os.path.join(IMG, 'floor.webp')).convert('RGB')
    big, small, gap = 208, 120, 14
    bh, sh = round(big * H / W), round(small * H / W)
    cw = 6 * big + 7 * gap
    ch = gap + 3 * (bh + gap) + 10 + 3 * (sh + gap)
    bg = floor.resize((cw, max(ch, round(cw * floor.height / floor.width))), Image.LANCZOS).crop((0, 0, cw, ch)).convert('RGBA')
    def rows(y0, w, h):
        for j, (d, name) in enumerate([(IMG, 'mat-front'), (OLD, 'mat-back'), (IMG, 'mat-back')]):
            for i in range(6):
                t = Image.open(os.path.join(d, f'{name}-{i}.png')).convert('RGBA').resize((w, h), Image.LANCZOS)
                x = gap + i * (big + gap) + (big - w) // 2
                sh_ = Image.new('RGBA', bg.size, (0, 0, 0, 0))
                sh_.paste((0, 0, 0, 120), (x + 2, y0 + j * (h + gap) + 4), t.split()[3])
                bg.alpha_composite(sh_.filter(ImageFilter.GaussianBlur(3)))
                bg.alpha_composite(t, (x, y0 + j * (h + gap)))
    rows(gap, big, bh)
    rows(gap + 3 * (bh + gap) + 10, small, sh)
    bg.convert('RGB').save(SHOT, optimize=True)
    print('비교 그림', SHOT, bg.size)


def main():
    os.makedirs(OLD, exist_ok=True)
    for i, cfg in enumerate(TILES):
        name = f'mat-back-{i}.png'
        old = os.path.join(OLD, name)
        if not os.path.exists(old):            # 처음 한 번: 옛 뒷면을 보관
            shutil.copyfile(os.path.join(IMG, name), old)
        im = Image.open(old)
        assert im.size == (W, H), (name, im.size)
        dst = os.path.join(IMG, name)
        save_png(repaint(im, cfg), dst)
        kb = os.path.getsize(dst) / 1024
        assert kb <= 60, (name, kb)
        print(f'{name} {kb:.1f}KB')
    if '--compare' in sys.argv:
        compare()


if __name__ == '__main__':
    main()
