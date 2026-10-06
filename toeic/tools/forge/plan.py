# 토익 사진 공방 — data/part1.json 에서 만들 사진 항목 목록을 만든다.
# 항목 id 는 문제 id(p1-001 …) 그대로라 다시 읽어도 같은 항목은 같은 id 다 (server.rebuild 가 상태·사진을 보존한다).
import json, os
import presets

PER_BATCH = 30   # 왼쪽 아래 '묶음' 필터: 30장씩
TYPE_KO = {'single': '한 사람', 'multi': '여러 사람', 'scene': '사람 없음'}


def _part1():
    p = os.path.join(presets.CONTENT, 'part1.json')
    if not os.path.exists(p): return []
    d = json.load(open(p, encoding='utf-8'))
    return d['items'] if isinstance(d, dict) else d


def load_book():
    n = len(_part1()); units = []
    for i in range(0, n, PER_BATCH):
        units.append({'n': i // PER_BATCH + 1, 'title': f'p1-{i + 1:03d}~{min(i + PER_BATCH, n):03d}'})
    return {'units': units}


def load_units():
    return [{'unit': u['n']} for u in load_book()['units']]


def cast_order(book):
    return []


def _item(**kw):
    it = {'status': 'pending', 'raw': '', 'cut': '', 'attempts': 0, 'error': '', 'updated': 0, 'auto_approved': False,
          'flow_url': '', 'prompt_edited': False, 'applied': '', 'gen': '', 'job_type': 'image', 'reference': None, 'unit': None}
    it.update(kw)
    return it


def build_items(book, units):
    items = []
    for i, q in enumerate(_part1()):
        items.append(_item(id=q['id'], kind='photo', title=f"{q['id']} · {q.get('setting', '')} · {TYPE_KO.get(q.get('type'), '')}",
                           unit=i // PER_BATCH + 1, prompt=q['prompt'], aspect='4:3', scene=q.get('scene', ''),
                           must=q.get('must', []), must_not=q.get('must_not', []), o=q.get('o', []), a=q.get('a', 0),
                           out=f"app/images/p1/{q['id']}.webp"))
    return items


def build_sounds(book, units):
    return []


SOUND_SUBS = {}
