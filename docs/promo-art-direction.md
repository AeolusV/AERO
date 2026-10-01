# AERO 宣传视觉

首页入口：[简体中文](../README.md) · [English](../README.en.md)

生成方式：内置 image_gen。宣传图不是实机截图，不替代产品功能说明。图片文案与构图方向如下，供后续品牌素材延展。

统一规范：克制的编辑排版，精致来自比例、对齐、层级和细节，而不是装饰数量。近白底色与炭黑标题、灰色副标题；缩小左上 Logo 与 AERO 字标，让控件成为主角。统一无衬线字体风格和标题层级，去掉贯穿底部的装饰线。只在控件和配置步骤层使用极浅投影、细微边缘高光和近白材质变化，背景不添加玻璃舞台、光晕或地面反射。状态色保持一致，宣传图不是产品状态的实机证明。生成图片是栅格视觉，不包含可核验的字体文件。Logo 沿用 `public/aero-logo.svg` 的圆环与右侧下垂笔画，不重新设计。宣传图风格转换不代表应用外观变化。

## 设计依据

以下是 Apple 官方的界面设计原则，应用于宣传版式时属于 AERO 的设计转译，而不是 Apple 规定的营销模板：

- [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)：简洁不等于极简主义；精工和愉悦应服务于产品目的，不能仅靠装饰。
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)：通过重要性排序、对齐和关联分组组织信息。
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)：用字号、字重和颜色建立层级，限制字体种类并确保可读性。
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)：颜色保持语义一致，不只依赖颜色表达含义。
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：材质用于区分功能层与内容层，克制使用，不铺满背景。

## 品牌主视觉 · aero-promo-hero.png

提示词：精修既有 AERO 编辑海报，保持平面排版与大面积留白，近白底色、炭黑标题、灰色副标题。缩小原有 Logo 与字标，统一左对齐、字距与层级；不使用超粗海报字重。完整栏与迷你栏保留实际控件数量和语义，六灯加迷你返回按钮。只给控件极浅漫射投影、柔和缎面与细边缘高光，状态灯轻微透亮，不做实体硬件、深内凹、霓虹或玻璃背景场景。标题“让任务留在视野里。”，副标题“轻盈悬浮，随手掌控。”，小字“By Aeolus”。去掉底部装饰线，作为另外两张的统一参考。

## 迷你状态栏 · aero-promo-mini.png

提示词：匹配精修主视觉的小 Logo、字体风格、层级、近白底色、边距与小字署名。迷你栏改为细腻石墨缎面，只有极浅投影和薄边缘高光，严格保留蓝、绿、黄、白、粉、蓝六灯与返回按钮，共七个均匀居中控件。灯带轻微通透，不做镜面球、强光晕或内凹。标题“少一点切换，多一点专注。”，副标题“六个任务灯，安静地留在视野里。”。不添加玻璃场景、实体设备或新功能。

## 本地语音唤醒 · aero-promo-voice.png

提示词：语音配置海报匹配精修主视觉的字体风格、小 Logo、近白背景、边距和署名。标题“一句唤醒，回到对话。”，副标题“Hey Codex · 本地离线监听”。四步位于一个连续的近白圆角分组层，极浅投影、低对比细分隔线；图标统一光学大小、圆角线宽和基线。保留“01 绑定热键 / Ctrl+Shift+V”“02 配置环境 / 语音设置 → 一键配置”“03 选择麦克风 / 选择实际输入设备”“04 开启监听 / 检查配置 → 监听开关”。下方注明“触发后释放麦克风；Voice 结束后手动重新监听。”。不做四块厚重悬浮玻璃卡，不添加假想界面或无限语音承诺。

## 英文宣传版本

生成方式仍为内置 image_gen，以对应中文宣传图为编辑参考；只做文案本地化，沿用 AERO 标志、署名、版式、近白背景和克制的控件材质。中文素材保留，英文版本用于 `README.en.md`。宣传图的英文不代表应用界面已经支持英文。

统一编辑提示词：English localization of this exact AERO poster. Preserve the existing blue AERO logo, By Aeolus footer, landscape composition, near-white palette, restrained satin surfaces and delicate shadows. Replace marketing copy only. Use consistent elegant sans-serif typography, charcoal headlines and gray subtitles. Preserve control counts and status meanings; no added decorations or UI redesign.

| 文件 | 标题 | 副标题 |
| --- | --- | --- |
| `aero-promo-hero-en.png` | Keep your tasks in sight. | Lightweight controls. Within reach. |
| `aero-promo-mini-en.png` | Less switching. More focus. | Six task lights. Quietly in view. |
| `aero-promo-voice-en.png` | Say hello. Start talking. | Hey Codex · Local wake-word detection |

语音图四步文案：`01 Bind hotkey / Ctrl+Shift+V`、`02 Set up runtime / Voice → One-click setup`、`03 Choose microphone / Select your input device`、`04 Enable listening / Check configuration → Listen`。注释：`Mic released after wake. Restart listening after Voice ends.` 长文案可合理换行，保持统一层级和可读性，不省略麦克风交接与手动重新监听的边界。
