#!/usr/bin/env python3
"""Generates every Crosshare logo/icon asset from one vector definition of the "((×))" mark.

Run from anywhere: python3 scripts/generate-icons.py  (needs Pillow; macOS for iconutil).
Outputs: assets/brand/*.svg, Expo source images, the prebuilt iOS/Android resources and the Mac app icon.
"""
import math
import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # supersampling for anti-aliasing

# The mark, in its own units, centred on the arcs' common centre (y grows downwards).
STROKE = 80
ARC_RADII = (270, 388)            # inner, outer
ARC_FROM, ARC_TO = 45, -7         # degrees above horizontal at each arc's top / bottom end
X_CENTER = (0, -8)
X_HALF = 88                       # each × arm runs ±X_HALF on both axes


def arc_points(r, side, steps=64):
  pts = []
  for i in range(steps + 1):
    t = math.radians(ARC_FROM + (ARC_TO - ARC_FROM) * i / steps)
    pts.append((side * r * math.cos(t), -r * math.sin(t)))
  return pts


def strokes():
  """Centre-lines of every stroke, as polylines."""
  lines = [arc_points(r, side) for r in ARC_RADII for side in (-1, 1)]
  cx, cy = X_CENTER
  lines.append([(cx - X_HALF, cy - X_HALF), (cx + X_HALF, cy + X_HALF)])
  lines.append([(cx + X_HALF, cy - X_HALF), (cx - X_HALF, cy + X_HALF)])
  return lines


def bounds():
  pts = [p for line in strokes() for p in line]
  h = STROKE / 2
  return (min(x for x, _ in pts) - h, min(y for _, y in pts) - h,
          max(x for x, _ in pts) + h, max(y for _, y in pts) + h)


BX0, BY0, BX1, BY1 = bounds()
MARK_W, MARK_H = BX1 - BX0, BY1 - BY0
MARK_CX, MARK_CY = (BX0 + BX1) / 2, (BY0 + BY1) / 2
# Furthest stroke edge from the visual centre, for fitting inside circular masks.
MARK_RADIUS = max(math.hypot(x - MARK_CX, y - MARK_CY) for line in strokes() for x, y in line) + STROKE / 2


# ---------- SVG ----------

def svg_paths():
  out = []
  for line in strokes():
    if len(line) == 2:
      (x0, y0), (x1, y1) = line
      out.append(f"M{x0:g} {y0:g}L{x1:g} {y1:g}")
    else:
      r = round(math.hypot(*line[0]), 3)
      (x0, y0), (x1, y1) = line[0], line[-1]
      sweep = 0 if x0 < 0 else 1  # left arcs run counter-clockwise top→bottom on screen
      out.append(f"M{x0:.2f} {y0:.2f}A{r:g} {r:g} 0 0 {sweep} {x1:.2f} {y1:.2f}")
  return "".join(out)


def svg_mark(color, transform=""):
  t = f' transform="{transform}"' if transform else ""
  return (f'<path{t} d="{svg_paths()}" fill="none" stroke="{color}" stroke-width="{STROKE}" '
          f'stroke-linecap="round" stroke-linejoin="round"/>')


def write_svgs():
  pad = 16
  vb = f"{BX0 - pad:g} {BY0 - pad:g} {MARK_W + 2 * pad:g} {MARK_H + 2 * pad:g}"
  head = '<svg xmlns="http://www.w3.org/2000/svg" '
  files = {
    "logo.svg": f'{head}viewBox="{vb}">{svg_mark("currentColor")}</svg>\n',
    "logo-white.svg": f'{head}viewBox="{vb}">{svg_mark("#fff")}</svg>\n',
    "logo-black.svg": f'{head}viewBox="{vb}">{svg_mark("#000")}</svg>\n',
  }
  # App icon: black rounded square (macOS grid: 824 body on a 1024 canvas, ~22.4% corner radius).
  s = 824 * 0.64 / MARK_W
  tr = f"translate(512 512) scale({s:.5f}) translate({-MARK_CX:g} {-MARK_CY:g})"
  files["app-icon.svg"] = (f'{head}viewBox="0 0 1024 1024"><rect x="100" y="100" width="824" height="824" '
                           f'rx="185" fill="#000"/>{svg_mark("#fff", tr)}</svg>\n')
  s = 1024 * 0.62 / MARK_W
  tr = f"translate(512 512) scale({s:.5f}) translate({-MARK_CX:g} {-MARK_CY:g})"
  files["app-icon-square.svg"] = (f'{head}viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#000"/>'
                                  f'{svg_mark("#fff", tr)}</svg>\n')
  for name, body in files.items():
    with open(os.path.join(ROOT, "assets/brand", name), "w") as f:
      f.write(body)


# ---------- raster ----------

def draw_mark(draw, cx, cy, width, color):
  """Draws the mark centred at (cx, cy) with the given overall width (pixels, already supersampled)."""
  s = width / MARK_W
  w = STROKE * s
  for line in strokes():
    pts = [(cx + (x - MARK_CX) * s, cy + (y - MARK_CY) * s) for x, y in line]
    # Fill the stroke outline (offset both sides along the normal); thick polylines alias badly.
    left, right = [], []
    for i, (x, y) in enumerate(pts):
      (ax, ay), (bx, by) = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
      d = math.hypot(bx - ax, by - ay)
      nx, ny = -(by - ay) / d * w / 2, (bx - ax) / d * w / 2
      left.append((x + nx, y + ny))
      right.append((x - nx, y - ny))
    draw.polygon(left + right[::-1], fill=color)
    for x, y in (pts[0], pts[-1]):
      draw.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=color)



def render(size, mark_width, bg=None, shape="square", inset=0, fg=(255, 255, 255, 255), shadow=False):
  """bg None → transparent. shape: square | circle | rounded (macOS grid ~22.5% corner radius)."""
  S = size * SS
  img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
  if bg is not None:
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    i = inset * SS
    if shape == "square":
      md.rectangle((i, i, S - i - 1, S - i - 1), fill=255)
    elif shape == "circle":
      md.ellipse((i, i, S - i - 1, S - i - 1), fill=255)
    elif shape == "rounded":
      md.rounded_rectangle((i, i, S - i - 1, S - i - 1), radius=(S - 2 * i) * 0.225, fill=255)
    if shadow:  # macOS icon template: soft drop shadow under the body
      sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
      sh.putalpha(mask.point(lambda v: v * 0.5).filter(ImageFilter.GaussianBlur(10 * S / 1024)))
      img.alpha_composite(sh, (0, round(10 * S / 1024)))
    body = Image.new("RGBA", (S, S), bg)
    img.paste(body, (0, 0), mask)
  draw_mark(ImageDraw.Draw(img), S / 2, S / 2, mark_width * SS, fg)
  return img.resize((size, size), Image.LANCZOS)


def save(img, path, opaque=False):
  path = os.path.join(ROOT, path)
  os.makedirs(os.path.dirname(path), exist_ok=True)
  if opaque:
    img = img.convert("RGB")
  if path.endswith(".webp"):
    img.save(path, "WEBP", lossless=True)
  else:
    img.save(path, optimize=True)


BLACK = (0, 0, 0, 255)


def fit_circle(size, frac):
  """Mark width so its furthest point stays within a centred circle of radius frac*size."""
  return size * frac / MARK_RADIUS * MARK_W


def main():
  write_svgs()
  mobile = "apps/mobile/assets/images"
  android = "apps/mobile/android/app/src/main/res"
  ios = "apps/mobile/ios/Crosshare/Images.xcassets"

  # iOS: full-bleed opaque square; the OS applies the rounded mask.
  ios_icon = render(1024, 1024 * 0.62, BLACK)
  save(ios_icon, f"{mobile}/icon.png", opaque=True)
  save(ios_icon, f"{ios}/AppIcon.appiconset/App-Icon-1024x1024@1x.png", opaque=True)

  # Android adaptive icon: 108dp layers, artwork inside the 66dp safe circle.
  save(render(1024, fit_circle(1024, 0.29)), f"{mobile}/android-icon-foreground.png")
  save(render(1024, fit_circle(1024, 0.29)), f"{mobile}/android-icon-monochrome.png")
  save(Image.new("RGB", (1024, 1024), (0, 0, 0)), f"{mobile}/android-icon-background.png")
  for d, k in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
    layer, legacy, splash = round(108 * k), round(48 * k), round(288 * k)
    save(render(layer, fit_circle(layer, 0.29)), f"{android}/mipmap-{d}/ic_launcher_foreground.webp")
    save(render(layer, fit_circle(layer, 0.29)), f"{android}/mipmap-{d}/ic_launcher_monochrome.webp")
    save(Image.new("RGBA", (layer, layer), BLACK), f"{android}/mipmap-{d}/ic_launcher_background.webp")
    # Pre-O launchers: shape baked in (48dp icon, ~44dp body).
    save(render(legacy, legacy * 0.6, BLACK, "rounded", inset=2 * k), f"{android}/mipmap-{d}/ic_launcher.webp")
    save(render(legacy, legacy * 0.6, BLACK, "circle", inset=2 * k), f"{android}/mipmap-{d}/ic_launcher_round.webp")
    # Android 12+ splash icon: 288dp canvas, masked to a 192dp circle.
    save(render(splash, fit_circle(splash, 0.29)), f"{android}/drawable-{d}/splashscreen_logo.png")

  # Splash (Expo source + prebuilt iOS): white mark on a black background.
  save(render(1024, fit_circle(1024, 0.29)), f"{mobile}/splash-icon.png")
  for name, px in (("image.png", 200), ("image@2x.png", 400), ("image@3x.png", 600)):
    save(render(px, px * 0.9), f"{ios}/SplashScreenLogo.imageset/{name}")

  # Web favicon.
  save(render(48, 48 * 0.62, BLACK, "rounded", inset=1), f"{mobile}/favicon.png")

  # macOS: 1024 grid with an 824 rounded body and drop shadow, packed into AppIcon.icns.
  mac_master = render(1024, 824 * 0.64, BLACK, "rounded", inset=100, shadow=True)
  save(mac_master, "assets/brand/app-icon-macos.png")
  save(ios_icon, "assets/brand/app-icon-1024.png", opaque=True)
  with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, "AppIcon.iconset")
    os.makedirs(iconset)
    for pt in (16, 32, 128, 256, 512):
      for scale in (1, 2):
        px = pt * scale
        img = mac_master if px == 1024 else render(px, px * 824 / 1024 * 0.64, BLACK, "rounded",
                                                   inset=px * 100 / 1024, shadow=px >= 64)
        suffix = "" if scale == 1 else "@2x"
        img.save(os.path.join(iconset, f"icon_{pt}x{pt}{suffix}.png"))
    out = os.path.join(ROOT, "apps/mac/Resources/AppIcon.icns")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)

  # macOS menu bar template image (black + alpha; AppKit tints it). 18pt tall canvas.
  for scale, suffix in ((1, ""), (2, "@2x")):
    w, h = 24 * scale, 18 * scale
    S = (w * SS, h * SS)
    img = Image.new("RGBA", S, (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), S[0] / 2, S[1] / 2, 22 * scale * SS, BLACK)
    img.resize((w, h), Image.LANCZOS).save(os.path.join(ROOT, f"apps/mac/Resources/MenuBarIcon{suffix}.png"))

  print("Generated icons.")


if __name__ == "__main__":
  main()
