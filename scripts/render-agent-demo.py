"""Render a 42s terminal replay from audited Desktop tool records (Pillow)."""
import hashlib
import json
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'assets/desktop-v0.9-tool-evidence.json'
evidence = json.loads(source.read_text(encoding='utf-8'))
runs = {r['callSeq']: r for r in evidence['runs']}
clean, changed, small = (runs[k] for k in (47, 60, 73))
for run in (clean, changed, small):
    assert len(run['renderedText'].encode('utf-16-le')) // 2 == run['actualTextChars']
    assert run['actualTextChars'] <= run['budgetChars']

def block(run, prefix):
    return next(p for p in run['renderedText'].split('\n\n') if p.startswith(prefix))

def call(run):
    args = {k: v for k, v in run['arguments'].items() if k != 'repoRoot'}
    return 'code_context(' + json.dumps(args, ensure_ascii=False, indent=2) + ')'

scenes = [
    ('01  Task -> actual Agent tool call', '任务描述 -> 真实 Agent 工具调用',
     call(clean) + '\n\nCaptured: 2026-10-05 | tool/call #47 -> tool/result #48\nTiny Git fixture | repoRoot omitted from display\n\nTask wording did not name loadConfig.\nThe Agent requested code_context to locate useful context.'),
    ('02  Primary source + inclusion reason', '关键源码、准确行号和入选理由',
     block(clean, 'primary:') + '\n\n' + clean['renderedText'].splitlines()[-1]),
    ('03  Caller + relationship provenance', '相关调用，以及关系证据来源',
     block(clean, 'caller:') + '\n\n' + block(clean, 'relationship: startup')),
    ('04  Likely test + actual test source', '相关测试线索，以及测试源码',
     block(clean, 'test:') + '\n\n' + block(clean, 'relationship: module') + '\n\nLikely tests are retrieval leads, not coverage proof.'),
    ('05  External edit -> Git change context', '外部编辑后，查询看到 Git 变更',
     call(changed) + '\n\n' + block(changed, 'primary: loadConfig') + '\n\n' + block(changed, 'primary: betaCaller')),
    ('06  Deleted source + honest budget fallback', '删除项保留基线源码，小预算明确降级',
     block(changed, 'change: removed') + '\n\n' + block(small, 'primary:') + '\n\nGaps: budget omitted some evidence\nBudget: 327 / 500 chars (trimmed low-priority context)'),
    ('07  Context ready for the next code step', 'Agent 已获得可继续处理任务的上下文',
     'Review guide / 展示说明（不是 Agent 回复原文）\n\nloadConfig -> startup -> tests/config.spec.ts\nSource ranges + reasons + relationship provenance\nCurrent changes: modified / added / deleted\nClean result: 1294 / 5000 chars\nChange result: 2326 / 5000 chars\n\nNo edit or test-success claim in this replay.\n此回放展示上下文获取，不宣称已修复 Bug 或测试通过。\n\nTry a task in your repo. What context did it miss?\n欢迎试用：它漏掉了什么重要上下文？'),
]

W, H = 1280, 900
mono_path = Path('C:/Windows/Fonts/consola.ttf')
cjk_path = Path('C:/Windows/Fonts/msyh.ttc')
mono = ImageFont.truetype(str(mono_path), 21)
ui = ImageFont.truetype(str(cjk_path), 23)
small_ui = ImageFont.truetype(str(cjk_path), 18)
title_font = ImageFont.truetype(str(mono_path), 28)
frames = []
for i, (title, subtitle, body) in enumerate(scenes):
    for second in (0,):
        im = Image.new('RGB', (W, H), '#0d1420')
        d = ImageDraw.Draw(im)
        d.text((34, 22), 'dsh-code-index v0.9.0 | Edit-ready Context Packs', font=title_font, fill='#f2f6fc')
        d.text((34, 68), '真实 Agent 记录的终端回放 / Replay of real Agent logs', font=ui, fill='#5de4c7')
        d.text((34, 107), 'Not a desktop screen recording | 非桌面录屏 | Edited pacing / 节奏经过剪辑', font=small_ui, fill='#a6b4ca')
        d.rounded_rectangle((24, 151, W-24, H-71), radius=12, fill='#172235', outline='#33445e')
        d.text((44, 169), title, font=title_font, fill='#86c5ff')
        d.text((44, 211), subtitle, font=ui, fill='#e4ecf7')
        y = 265
        display_lines = [part for line in body.splitlines() for part in (textwrap.wrap(line, width=94, break_long_words=False, break_on_hyphens=False) or [''])]
        for line in display_lines:
            font = ui if any(ord(c) > 0x3000 for c in line) else mono
            assert d.textlength(line, font=font) < W-88, f'Line too wide: {line}'
            assert y + 28 < H-77, f'Scene {i+1} too tall'
            color = '#5de4c7' if line.startswith(('Reason:', 'Relationship provenance:', 'Budget:', 'Change:')) else '#e4ecf7'
            d.text((44, y), line, font=font, fill=color)
            y += 27
        elapsed = i*6 + second
        d.text((34, H-57), 'DSH Desktop 0.2.0-rc.2 | Evidence: 2026-10-05 | Excerpts / 原文节选', font=small_ui, fill='#a6b4ca')
        d.text((1090, H-57), f'{elapsed:02d} / 42 s', font=mono, fill='#a6b4ca')
        d.rectangle((0, H-8, int(W*(elapsed+1)/42), H), fill='#5de4c7')
        frames.append(im)

assets = ROOT / 'assets'
frames[1].save(assets / 'agent-context-demo.png')
frames[0].save(assets / 'agent-context-demo.gif', save_all=True, append_images=frames[1:], duration=6000, loop=0, optimize=True)
preview_dir = ROOT / '.promotion-work/demo-frames'
preview_dir.mkdir(parents=True, exist_ok=True)
for i in range(7):
    frames[i].save(preview_dir / f'{i+1}.png')
cast_frames = [[i*6, 'o', '\x1b[2J\x1b[H' + title + '\r\n' + subtitle + '\r\n\r\n' + body.replace('\n', '\r\n')] for i, (title, subtitle, body) in enumerate(scenes)]
cast_frames.append([42, 'o', '\r\nReplay complete / 回放结束\r\n'])
header = {'version': 2, 'width': 110, 'height': 30, 'title': 'Real Desktop Agent log replay (not screen capture)', 'duration': 42}
(assets / 'agent-context-demo.cast').write_bytes(('\n'.join(json.dumps(x, ensure_ascii=False) for x in [header, *cast_frames]) + '\n').encode('utf-8'))
manifest = {'format': 'Terminal-style replay of actual persisted Agent records; not a screen capture', 'durationSeconds': 42, 'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'callSeqs': [47, 60, 73], 'edits': ['7 panels with 6-second holds; timing is editorial, not measured latency', 'repoRoot omitted from displayed arguments', 'Verbatim source/reason/provenance excerpts; not all returned items shown', 'First/last panel commentary is authored narration, not Agent response'], 'sceneTitles': [s[0] for s in scenes]}
(assets / 'agent-context-demo.provenance.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print('Rendered 42-second bilingual replay from real Desktop callSeqs 47, 60, 73.')
