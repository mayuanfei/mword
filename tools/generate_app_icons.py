import os
import subprocess
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CLIENT_DIR = os.path.join(PROJECT_ROOT, "mword-client")
PUBLIC_DIR = os.path.join(CLIENT_DIR, "public")
ANDROID_RES = os.path.join(CLIENT_DIR, "android", "app", "src", "main", "res")
IOS_APPICON = os.path.join(CLIENT_DIR, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset")

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 1. 生成 master SVG
# 包含纯墨绿背景 #455b36 + 居中白色 BookOpen 图标
def generate_svg(rounded=False, rx=230, full_bleed=True):
    rect_tag = f'<rect width="1024" height="1024" rx="{rx if rounded else 0}" fill="#455b36"/>' if full_bleed else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  {rect_tag}
  <g transform="translate(232, 232) scale(23.333333)">
    <path d="M12 7v14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>'''

# 2. 生成圆形 SVG (用于 Android ic_launcher_round)
def generate_round_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <circle cx="512" cy="512" r="512" fill="#455b36"/>
  <g transform="translate(252, 252) scale(21.666667)">
    <path d="M12 7v14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>'''

# 3. 生成 Android 前景层 SVG (108dp 视口中位于安全区 66dp 内部的透明前景)
def generate_foreground_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(280, 280) scale(19.333333)">
    <path d="M12 7v14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>'''

def render_svg_to_png(svg_content, output_png_path, size=1024):
    tmp_html = f"/tmp/render_{os.path.basename(output_png_path)}.html"
    with open(tmp_html, 'w', encoding='utf-8') as f:
        f.write(f'''<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  html, body {{ margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:transparent; }}
  svg {{ width:100%; height:100%; display:block; }}
</style></head>
<body>{svg_content}</body>
</html>''')
    
    cmd = [
        CHROME_BIN,
        "--headless",
        f"--screenshot={output_png_path}",
        f"--window-size={size},{size}",
        "--default-background-color=00000000",
        f"file://{tmp_html}"
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(tmp_html):
        os.remove(tmp_html)

def resize_image(src_path, dst_path, size):
    with Image.open(src_path) as im:
        resized = im.resize((size, size), Image.Resampling.LANCZOS)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        resized.save(dst_path, "PNG", optimize=True)

def main():
    print("==> 1. 生成 master 图标...")
    master_full = "/tmp/master_full_1024.png"
    master_round = "/tmp/master_round_1024.png"
    master_fg = "/tmp/master_fg_1024.png"
    
    # 满铺墨绿底（用于 iOS、PWA maskable 和通用方形图标）
    render_svg_to_png(generate_svg(rounded=False), master_full, 1024)
    # 正圆形墨绿底（用于 Android ic_launcher_round）
    render_svg_to_png(generate_round_svg(), master_round, 1024)
    # 透明底白色书本（用于 Android 自适应前景）
    render_svg_to_png(generate_foreground_svg(), master_fg, 1024)
    print("Master PNG 生成完成")

    # 2. 更新 Web / PWA 资源
    print("==> 2. 更新 Web & PWA 图标资源...")
    # favicon.svg (带优雅圆角)
    favicon_svg_path = os.path.join(PUBLIC_DIR, "favicon.svg")
    with open(favicon_svg_path, 'w', encoding='utf-8') as f:
        f.write(generate_svg(rounded=True, rx=230))
    print(f"写入: {favicon_svg_path}")

    # apple-touch-icon.png (180x180)
    resize_image(master_full, os.path.join(PUBLIC_DIR, "apple-touch-icon.png"), 180)
    # pwa-192x192.png
    resize_image(master_full, os.path.join(PUBLIC_DIR, "pwa-192x192.png"), 192)
    # pwa-512x512.png
    resize_image(master_full, os.path.join(PUBLIC_DIR, "pwa-512x512.png"), 512)

    # 3. 更新 iOS 资源
    print("==> 3. 更新 iOS AppIcon 资源...")
    if os.path.exists(IOS_APPICON):
        resize_image(master_full, os.path.join(IOS_APPICON, "AppIcon-512@2x.png"), 1024)
        print("iOS AppIcon 更新成功")

    # 4. 更新 Android 各分辨率 mipmap 资源
    print("==> 4. 更新 Android mipmap 资源...")
    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    fg_sizes = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }

    for folder, size in android_sizes.items():
        folder_path = os.path.join(ANDROID_RES, folder)
        # ic_launcher.png
        resize_image(master_full, os.path.join(folder_path, "ic_launcher.png"), size)
        # ic_launcher_round.png
        resize_image(master_round, os.path.join(folder_path, "ic_launcher_round.png"), size)
        # ic_launcher_foreground.png
        fg_size = fg_sizes[folder]
        resize_image(master_fg, os.path.join(folder_path, "ic_launcher_foreground.png"), fg_size)
        print(f"Android {folder} ({size}x{size}, fg: {fg_size}x{fg_size}) 完成")

    print("[SUCCESS] 所有应用图标生成完毕！")

if __name__ == "__main__":
    main()
