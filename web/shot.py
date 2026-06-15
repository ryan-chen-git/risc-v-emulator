#!/usr/bin/env python3
# Screenshot the real page in headless Chromium (runs the JS, real fonts).
# usage: shot.py [url] [out.png] [cycleIndex]
from playwright.sync_api import sync_playwright
import sys

url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8137/datapath.html"
out = sys.argv[2] if len(sys.argv) > 2 else "shot.png"
idx = int(sys.argv[3]) if len(sys.argv) > 3 else None
clip = None
if len(sys.argv) > 4:  # "x,y,w,h"
    x, y, w, h = map(int, sys.argv[4].split(","))
    clip = {"x": x, "y": y, "width": w, "height": h}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1320, "height": 820}, device_scale_factor=3)
    pg.goto(url, wait_until="load")
    pg.wait_for_timeout(400)
    if idx is not None:
        pg.evaluate(f"go({idx})")
        pg.wait_for_timeout(150)
    pg.screenshot(path=out, full_page=(clip is None), clip=clip)
    b.close()
print("wrote", out)
