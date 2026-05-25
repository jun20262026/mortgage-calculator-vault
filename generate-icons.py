#!/usr/bin/env python3
"""
生成 iOS App 图标和启动图
计算器风格：深色背景 + 橙色按钮
"""

from PIL import Image, ImageDraw, ImageFont
import os

# iOS 图标尺寸
ICON_SIZES = [
    (20, 20), (29, 29), (40, 40), (58, 58), (60, 60),
    (76, 76), (80, 80), (87, 87), (120, 120), (152, 152),
    (167, 167), (180, 180), (1024, 1024)
]

# 启动图尺寸 (iPhone)
SPLASH_SIZES = [
    (640, 1136),   # iPhone 5/SE
    (750, 1334),   # iPhone 6/7/8
    (828, 1792),   # iPhone XR/11
    (1125, 2436),  # iPhone X/XS/11 Pro
    (1242, 2688),  # iPhone XS Max/11 Pro Max
    (1170, 2532),  # iPhone 12/13/14
    (1290, 2796),  # iPhone 14 Pro Max
]

def create_calculator_icon(size):
    """创建计算器风格图标"""
    img = Image.new('RGB', (size, size), '#1c1c1e')
    draw = ImageDraw.Draw(img)

    # 圆角矩形背景
    padding = size // 8
    radius = size // 6
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=radius,
        fill='#2c2c2e'
    )

    # 计算器按钮布局
    btn_size = (size - 2 * padding) // 4
    gap = btn_size // 6
    start_x = padding + gap
    start_y = padding + gap + btn_size // 2

    # 按钮颜色
    colors = {
        'num': '#333333',
        'op': '#ff9500',
        'func': '#a5a5a5'
    }

    # 绘制几个代表性按钮
    btn_radius = btn_size // 2 - gap

    # 数字按钮 (7, 8, 9)
    for col in range(3):
        x = start_x + col * (btn_size + gap)
        y = start_y
        cx = x + btn_size // 2
        cy = y + btn_size // 2
        draw.ellipse([cx - btn_radius, cy - btn_radius, cx + btn_radius, cy + btn_radius], fill=colors['num'])

    # 运算符按钮 (+)
    x = start_x + 3 * (btn_size + gap)
    y = start_y + 2 * (btn_size + gap)
    cx = x + btn_size // 2
    cy = y + btn_size // 2
    draw.ellipse([cx - btn_radius, cy - btn_radius, cx + btn_radius, cy + btn_radius], fill=colors['op'])

    # 等号按钮 (=)
    x = start_x + 3 * (btn_size + gap)
    y = start_y + 3 * (btn_size + gap)
    cx = x + btn_size // 2
    cy = y + btn_size // 2
    draw.ellipse([cx - btn_radius, cy - btn_radius, cx + btn_radius, cy + btn_radius], fill=colors['op'])

    # 0 按钮 (长条形)
    x = start_x
    y = start_y + 3 * (btn_size + gap)
    draw.rounded_rectangle([x, y, x + 2 * btn_size + gap, y + btn_size], radius=btn_radius, fill=colors['num'])

    return img

def create_splash_screen(size):
    """创建启动图"""
    img = Image.new('RGB', size, '#000000')
    draw = ImageDraw.Draw(img)

    # 中心计算器图标
    icon_size = min(size[0], size[1]) // 3
    icon = create_calculator_icon(icon_size)
    x = (size[0] - icon_size) // 2
    y = (size[1] - icon_size) // 2 - 40
    img.paste(icon, (x, y))

    # 文字
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 32)
        except:
            font = ImageFont.load_default()

    text = "房贷计算器"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (size[0] - text_w) // 2
    text_y = y + icon_size + 30
    draw.text((text_x, text_y), text, fill='#888888', font=font)

    return img

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # 生成图标
    icons_dir = os.path.join(base_dir, 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    for w, h in ICON_SIZES:
        icon = create_calculator_icon(w)
        icon.save(os.path.join(icons_dir, f'icon-{w}x{h}.png'))
        print(f"✅ 生成图标: icon-{w}x{h}.png")

    # 生成启动图
    splash_dir = os.path.join(base_dir, 'splash')
    os.makedirs(splash_dir, exist_ok=True)

    for w, h in SPLASH_SIZES:
        splash = create_splash_screen((w, h))
        splash.save(os.path.join(splash_dir, f'splash-{w}x{h}.png'))
        print(f"✅ 生成启动图: splash-{w}x{h}.png")

    print("\n🎉 全部生成完成！")
    print(f"图标目录: {icons_dir}")
    print(f"启动图目录: {splash_dir}")

if __name__ == '__main__':
    main()
