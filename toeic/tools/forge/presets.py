# 토익 사진 공방(forge) — 경로·상수·기본 설정.
# 파닉스 교재 공방(phonics/tools/forge)을 복사해 Part 1 사진 전용으로 줄인 것. 원본은 건드리지 않는다.
# 문제 내용은 여기 없고 data/part1.json 에서 읽는다 (plan.py).
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # …\script\toeic
CONTENT = os.path.join(ROOT, 'data')
ART_DATA = os.path.join(ROOT, 'art-src', 'forge')       # 사진 원본·검수본·상태 (저장소에 올리지 않음)
AUDIO_DATA = os.path.join(ROOT, 'art-src', 'forge-audio')  # 소리 탭은 쓰지 않는다 (음성은 Kokoro 로 따로 만든다)
WEB = os.path.join(ROOT, 'app')
GAME_SECRETS = ''   # 다른 프로그램의 키를 복사해 오지 않는다. 제미나이를 쓰려면 진행·설정 탭에 직접 넣는다

# 그림 분류 (왼쪽 메뉴)
KINDS = {'photo': 'Part 1 사진'}
POSE_KO = {}

# 앱에 넣는 사진 크기 (4:3). 검수본은 1200×900 JPEG, 앱에는 960×720 WebP
CUT_SIZE = (1200, 900)
APP_SIZE = (960, 720)
WEBP_QUALITY = 78

# 나노바나나 모델과 한 장당 값 (달러, 2026-09-20 ai.google.dev/gemini-api/docs/pricing) — 기본은 플로우라 쓰지 않음
GEMINI_MODELS = {
    'gemini-3.1-flash-image': {'name': '나노바나나 2 (3.1 Flash Image)', 'price': {'512px': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151}},
    'gemini-3.1-flash-lite-image': {'name': '나노바나나 2 Lite (3.1 Flash Lite Image)', 'price': {'512px': 0.0336, '1K': 0.0336, '2K': 0.0336, '4K': 0.0336}},
    'gemini-3-pro-image': {'name': '나노바나나 Pro (3 Pro Image)', 'price': {'512px': 0.134, '1K': 0.134, '2K': 0.134, '4K': 0.24}},
}

# 아래는 server.py 소리 코드가 참조하는 값 (소리 탭은 숨김)
TTS_MODEL = 'gemini-3.8-flash-tts'
VOICES = [('Kore', '단단함')]
STRETCH = {}
SAY_PREFIX = ''
CHECK_MODEL = 'gemini-3.5-flash-lite'
PLOSIVES = set()
CUT_MS = {'plosive': 180, 'other': 350}


def sound_variants(letter, ipa):
    return []


DEFAULT_SETTINGS = {
    'generator': 'flow',          # 기본 생성기: flow(확장) | gemini(API)
    'auto_approve_ref': False,    # 사진에는 기준 그림이 없다
    'max_inflight': 4,            # 확장에 한 번에 걸어 두는 잡 수
    'gemini_model': 'gemini-3.1-flash-image',
    'gemini_size': '1K',
    'gemini_workers': 2,
    'tts_model': TTS_MODEL,
    'tts_workers': 1,
    'sound_variants': {},
    'say_prefix': SAY_PREFIX,
    'check_model': CHECK_MODEL,
    'cut_ms': dict(CUT_MS),
    'port': 8767,                 # 교재 공방(8766)·캐릭터 공방(8765)과 겹치지 않게
    'next_asset_no': 3001,        # 교재 공방 2001~, 게임 공방 1001~ 과 겹치지 않게 (사진은 참조 그림을 안 쓴다)
    'gemini_usage': {'count': 0, 'cost': 0.0},
    'tts_usage': {'count': 0, 'tokens': 0, 'checks': 0},
}
