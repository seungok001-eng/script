# 교재 공방 — 그림 뒤처리. 게임 캐릭터 공방(C:\game\tools\charforge\imgproc.py)의 배경 제거·여백 자르기·축소·격자를 가져오고
# 교재용(선 그림 임계값, 장면 4:3 자르기, 캐스트 시트 합성)을 더했다.
import io
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def load(data):
    im = Image.open(io.BytesIO(data) if isinstance(data, (bytes, bytearray)) else data)
    im.load()
    return im


def cutout(im):
    """가장자리에서 이어진 배경색(네 모서리 색, 보통 흰색)을 투명하게. 결과는 RGBA."""
    if im.mode == 'RGBA':
        al = np.asarray(im)[..., 3]
        if (al < 8).mean() > 0.05:
            return im  # 이미 투명 배경
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    mx = a.max(axis=2); mn = a.min(axis=2)
    h, w = a.shape[:2]
    corner = np.median(np.stack([a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1], a[0, w // 2], a[h - 1, w // 2], a[h // 2, 0], a[h // 2, w - 1]]), axis=0)
    light = (np.abs(a - corner[None, None, :]).max(axis=2) <= 18) & ((mx - mn) < 24)
    lab, n = ndimage.label(light)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge != 0]
    bg = np.isin(lab, edge)
    if bg.mean() < 0.03:
        bg = corner_flood(a, 40)
    # 팔과 몸 사이처럼 둘러싸인 큰 배경 조각도 배경으로
    pocket = light & ~bg
    pl, pn = ndimage.label(pocket)
    if pn > 0:
        sizes = ndimage.sum(pocket, pl, range(1, pn + 1))
        close = ndimage.mean((np.abs(a - corner[None, None, :]).max(axis=2) <= 8).astype(np.float32), pl, range(1, pn + 1))
        for i in range(pn):
            if sizes[i] > 300 and close[i] > 0.9:
                bg |= (pl == i + 1)
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=1)
    holes = ndimage.binary_fill_holes(fg) & ~fg
    hl, hn = ndimage.label(holes)
    if hn > 0:
        sizes = ndimage.sum(holes, hl, range(1, hn + 1))
        lightfrac = ndimage.mean(light.astype(np.float32), hl, range(1, hn + 1))
        for i in range(hn):
            if sizes[i] > 60 and lightfrac[i] > 0.7:
                holes[hl == i + 1] = False
    fg = fg | holes
    alpha = fg.astype(np.float32)
    rim = fg & ~ndimage.binary_erosion(fg, iterations=1)
    lum = a.mean(axis=2) / 255.0
    alpha[rim] = np.clip(1.4 - lum[rim], 0.35, 1.0)
    rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def corner_flood(a, tol):
    h, w = a.shape[:2]
    corners = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    near = np.zeros((h, w), bool)
    for c in corners:
        near |= np.abs(a - c[None, None, :]).sum(axis=2) <= tol
    lab, n = ndimage.label(near)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(lab, edge)


def keep_largest(im, min_frac=0.02):
    """작은 먼지 조각을 지운다. 큰 조각(최대 조각의 min_frac 이상)은 남긴다."""
    a = np.asarray(im)
    fg = a[..., 3] > 8
    lab, n = ndimage.label(fg)
    if n <= 1:
        return im
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    keep = np.zeros_like(fg)
    for i in range(n):
        if sizes[i] >= sizes.max() * min_frac:
            keep |= lab == i + 1
    a = a.copy(); a[~keep, 3] = 0
    return Image.fromarray(a, 'RGBA')


def bounds(im):
    a = np.asarray(im)
    ys, xs = np.where(a[..., 3] > 8)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def scale_frames(frames, height):
    """그림들을 같은 배율로 줄인다 (가장 키 큰 것이 height). 미리 곱한 알파로 줄여 가장자리에 배경색이 안 번지게."""
    tallest = max(f.height for f in frames)
    s = height / tallest
    out = []
    for f in frames:
        w = max(1, int(round(f.width * s))); h = max(1, int(round(f.height * s)))
        a = np.asarray(f.convert('RGBA')).astype(np.float32) / 255.0
        pm = a[..., :3] * a[..., 3:4]
        pm_im = Image.fromarray((pm * 255).astype(np.uint8), 'RGB').resize((w, h), Image.LANCZOS)
        al_im = Image.fromarray((a[..., 3] * 255).astype(np.uint8), 'L').resize((w, h), Image.LANCZOS)
        pm = np.asarray(pm_im).astype(np.float32) / 255.0
        al = np.asarray(al_im).astype(np.float32) / 255.0
        rgb = np.where(al[..., None] > 0.003, pm / np.maximum(al[..., None], 0.003), 0)
        out.append(Image.fromarray(np.dstack([np.clip(rgb * 255, 0, 255).astype(np.uint8), (al * 255).astype(np.uint8)]), 'RGBA'))
    return out


def fit_max(im, max_side):
    """긴 변이 max_side 를 넘으면 줄인다 (작으면 그대로)."""
    if max(im.width, im.height) <= max_side:
        return im
    h = max_side if im.height >= im.width else max(1, int(round(im.height * max_side / im.width)))
    return scale_frames([im], h)[0]


def to_png(im):
    buf = io.BytesIO(); im.save(buf, 'PNG'); return buf.getvalue()


# ---------- 교재용 ----------
def process_cut(data, max_side=1024):
    """캐릭터·단어·나무: 배경 제거 → 먼지 제거 → 여백 자르기 → 긴 변 max_side 이하 → RGBA."""
    cut = keep_largest(cutout(load(data)), 0.01)
    b = bounds(cut)
    if not b:
        raise ValueError('그림에서 물체를 찾지 못했다 (배경이 흰색이 아닌가?)')
    return fit_max(cut.crop(b), max_side)


def process_line(data, max_side=1024, thresh=128):
    """선 그림: 배경 제거 뒤 어두운 픽셀만 검정으로 남기고 나머지는 투명 (워크북 색칠·따라 그리기용)."""
    im = load(data).convert('RGB')
    cut = cutout(im)
    a = np.asarray(cut)
    lum = a[..., :3].astype(np.int16).mean(axis=2)
    ink = (lum < thresh) & (a[..., 3] > 8)
    ink = keep_largest(Image.fromarray(np.dstack([np.zeros_like(a[..., :3]), (ink * 255).astype(np.uint8)]), 'RGBA'), 0.005)
    b = bounds(ink)
    if not b:
        raise ValueError('선을 찾지 못했다 (검은 외곽선 그림이 아닌가?)')
    out = ink.crop(b)
    # 부드럽게: 흑백 알파를 그대로 쓰되 줄일 때 안티에일리어스
    return fit_max(out, max_side)


def process_scene(data, w=1600, h=1200):
    """장면: 배경 제거 없이 4:3 로 가운데를 잘라 w×h (RGB, JPEG 로 저장)."""
    im = load(data).convert('RGB')
    r = w / h
    cw, ch = im.size
    if cw / ch > r:
        nw = int(round(ch * r)); x0 = (cw - nw) // 2; im = im.crop((x0, 0, x0 + nw, ch))
    else:
        nh = int(round(cw / r)); y0 = (ch - nh) // 2; im = im.crop((0, y0, cw, y0 + nh))
    return im.resize((w, h), Image.LANCZOS)


def cast_sheet(images, height=768, gap=48, margin=48):
    """캐스트 시트: 완성(투명) 그림들을 높이 height 로 맞춰 흰 바탕에 나란히."""
    ims = [scale_frames([im.convert('RGBA')], height)[0] for im in images]
    W = margin * 2 + sum(i.width for i in ims) + gap * (len(ims) - 1)
    sheet = Image.new('RGB', (W, height + margin * 2), (255, 255, 255))
    x = margin
    for im in ims:
        sheet.paste(im, (x, margin + height - im.height), im)
        x += im.width + gap
    return sheet


def grid_sheet(entries, cell=220, cols=6, label_h=18):
    """검수 격자: entries = [(제목, PIL 그림)]. 바둑판 배경, 제목은 아래."""
    n = len(entries); rows = max(1, (n + cols - 1) // cols)
    W = cols * cell; H = rows * (cell + label_h)
    sheet = Image.new('RGBA', (W, H), (40, 40, 44, 255))
    d = ImageDraw.Draw(sheet)
    for k, (name, f) in enumerate(entries):
        x0 = (k % cols) * cell; y0 = (k // cols) * (cell + label_h)
        for yy in range(0, cell, 10):
            for xx in range(0, cell, 10):
                col = (70, 70, 74, 255) if (xx // 10 + yy // 10) % 2 == 0 else (58, 58, 62, 255)
                d.rectangle((x0 + xx, y0 + yy, x0 + xx + 9, y0 + yy + 9), fill=col)
        f = f.convert('RGBA')
        s = min(1.0, (cell - 8) / max(f.width, f.height))
        g = f.resize((max(1, int(f.width * s)), max(1, int(f.height * s))), Image.LANCZOS) if s < 1 else f
        sheet.alpha_composite(g, (x0 + (cell - g.width) // 2, y0 + (cell - g.height) // 2))
        d.text((x0 + 4, y0 + cell + 2), str(name)[:30], fill=(220, 220, 220, 255))
    return sheet
