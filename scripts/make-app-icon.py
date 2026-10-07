"""用 hub/tools/make_icon.py 的绘制逻辑，重绘一张 1024×1024 的应用图标。

macOS 的 electron-builder 要求应用图标至少 512×512（Windows 用 .ico、Linux 没有
硬性下限，所以这个要求只在 mac 构建上暴露）。现有 build/icon.png 是 256×256，
不足以满足。这里复用同一个 render()，避免多出一份会走样的图标源文件。
"""

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "hub", "tools"))

import make_icon  # noqa: E402

SIZE = 1024
out = os.path.join(ROOT, "build", "icon.png")

start = time.time()
rgba = make_icon.render(SIZE)
blob = make_icon.png_bytes(SIZE, SIZE, rgba)
with open(out, "wb") as handle:
    handle.write(blob)

print("wrote %s  %d bytes  (%dx%d, %.1fs)" % (out, len(blob), SIZE, SIZE, time.time() - start))

# 复核：确认确实是 1024×1024 的 PNG，而不是被上游尺寸逻辑截断。
import struct  # noqa: E402

with open(out, "rb") as handle:
    head = handle.read(24)

assert head[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
width, height = struct.unpack(">II", head[16:24])
print("verified header: %dx%d" % (width, height))
assert (width, height) == (SIZE, SIZE), "size mismatch"
