# Tạo icon M PlayO từ logo gốc (design/icon/source-logo.webp)
# - Cỡ lớn (128, 256, png 512/1024): logo đầy đủ có chữ PLAYO
# - Cỡ nhỏ (16..64, dùng cho icon file trong Explorer, taskbar): chỉ tam giác cam, to và căn giữa
import numpy as np, cv2, sys, os
from PIL import Image
from scipy import ndimage as nd
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = np.array(Image.open(os.path.join(root, 'design/icon/source-logo.webp')).convert('RGB')).astype(np.float32)
H, W = src.shape[:2]
tile = nd.binary_fill_holes(src.max(2) > 6).astype(np.uint8)
ty, tx = np.where(tile); T = (tx.min(), ty.min(), tx.max() + 1, ty.max() + 1)

# 1) nền ô logo không có hình + chữ (tô lại từ phần nền xung quanh)
rm = np.zeros((H, W), np.uint8); rm[190:780, 140:940] = 1; rm[790:975, 215:1045] = 1
rmd = cv2.dilate(rm, np.ones((61, 61), np.uint8))
inner = cv2.erode(tile, np.ones((41, 41), np.uint8))
w = ((1 - rmd) * inner).astype(np.float32)
def nc(sg):
    num = cv2.GaussianBlur(src * w[..., None], (0, 0), sg); den = cv2.GaussianBlur(w, (0, 0), sg)[..., None]
    return num / np.maximum(den, 1e-4), den
b1, d1 = nc(60); b2, _ = nc(160)
k = np.clip(d1 / 0.3, 0, 1); bgf = b1 * k + b2 * (1 - k)
m3 = cv2.GaussianBlur(cv2.erode(tile, np.ones((81, 81), np.uint8)).astype(np.float32), (0, 0), 25)[..., None]
bg = src * (1 - m3) + bgf * m3

# 2) tách riêng hình tam giác (khối lớn nhất), bỏ 2 vệt tốc độ
diff = np.abs(src - bgf).max(2)
reg = np.zeros((H, W), bool); reg[190:775, 140:940] = True
hard = nd.binary_fill_holes(nd.binary_closing((diff > 40) & reg, iterations=3))
lab, n = nd.label(hard); sizes = nd.sum(hard, lab, range(1, n + 1))
tri = lab == (int(np.argmax(sizes)) + 1)
a = cv2.GaussianBlur(tri.astype(np.float32), (0, 0), 1.2)
ys, xs = np.where(tri); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

# 3) đặt tam giác to lên giữa ô (chiếm ~80% ô), căn theo khung bao (dịch nhẹ sang phải cho cân thị giác)
tw, th = T[2] - T[0], T[3] - T[1]
S = 0.80 * min(tw / (x1 - x0), th / (y1 - y0))
cxT, cyT = (T[0] + T[2]) / 2 + 0.02 * tw * 0, (T[1] + T[3]) / 2
M = np.float32([[S, 0, cxT - S * (x0 + x1) / 2], [0, S, cyT - S * (y0 + y1) / 2]])
sym = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_CUBIC)
al = cv2.warpAffine(a, M, (W, H))[..., None]
small = np.clip(bg * (1 - al) + sym * al, 0, 255).astype(np.uint8)

ta = (cv2.GaussianBlur(tile.astype(np.float32), (0, 0), 1.0) * 255).astype(np.uint8)
def sq(rgb):
    im = Image.fromarray(np.dstack([rgb, ta])).crop((T[0] - 4, T[1] - 4, T[2] + 4, T[3] + 4))
    s = max(im.size); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.paste(im, ((s - im.width) // 2, (s - im.height) // 2)); return c
full = sq(src.astype(np.uint8)); simple = sq(small)
out = os.path.join(root, 'build')
full.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, 'icon-1024.png'))
full.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'icon.png'))
simple.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'icon-small.png'))
imgs = [simple.resize((s, s), Image.LANCZOS) for s in (16, 20, 24, 32, 40, 48, 64)] + \
       [full.resize((s, s), Image.LANCZOS) for s in (128, 256)]
imgs[-1].save(os.path.join(out, 'icon.ico'), format='ICO', sizes=[i.size for i in imgs], append_images=imgs[:-1])
print('ok', os.path.getsize(os.path.join(out, 'icon.ico')))
