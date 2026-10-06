# 교재 공방 — 소리: 제미나이 TTS 호출, WAV 머리 붙이기, ffmpeg 로 자르기·무음 제거·음량 맞춤·mp3.
import base64, json, os, struct, subprocess, urllib.request, urllib.error

TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'


def wav_from_pcm(pcm, rate=24000, channels=1, bits=16):
    """L16 PCM 에 44바이트 WAV 머리를 씌운다."""
    byte_rate = rate * channels * bits // 8
    hdr = struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + len(pcm), b'WAVE', b'fmt ', 16, 1, channels, rate, byte_rate, channels * bits // 8, bits, b'data', len(pcm))
    return hdr + pcm


def _post(url, body, key, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST', headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode("utf-8", "replace")[:400]}')


def tts(text, voice, key, model):
    """제미나이 TTS 한 번. 결과 (wav bytes, 음성 토큰 수). 실패하면 예외.
    실험 결과(2026-10-06): systemInstruction 은 이 모델에서 400 오류라 쓰지 않는다. 대본에 긴 지시문을 넣으면 지시문까지 읽는다.
    응답 inlineData.mimeType 은 audio/wav 로 오고(그대로 저장), L16 으로 오면 WAV 머리를 씌운다. 사용량은 usageMetadata.candidatesTokenCount."""
    if not key: raise RuntimeError('제미나이 API 키가 없다 (설정에서 넣기)')
    body = {'contents': [{'parts': [{'text': text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    res = _post(TTS_URL.format(model=model), body, key)
    for cand in res.get('candidates', []):
        for part in (cand.get('content') or {}).get('parts', []):
            d = part.get('inlineData') or part.get('inline_data')
            if not d or not d.get('data'): continue
            raw = base64.b64decode(d['data'])
            mime = (d.get('mimeType') or d.get('mime_type') or '').lower()
            if mime.startswith('audio/wav') or raw[:4] == b'RIFF':
                wav = raw
            else:
                rate = 24000
                for p in mime.split(';'):
                    if p.strip().startswith('rate='): rate = int(p.strip()[5:])
                wav = wav_from_pcm(raw, rate)
            tokens = int((res.get('usageMetadata') or {}).get('candidatesTokenCount', 0) or 0)
            return wav, tokens
    fb = res.get('promptFeedback') or {}
    raise RuntimeError('TTS 가 소리를 돌려주지 않음: ' + (fb.get('blockReason') or json.dumps(res)[:300]))


CHECK_PROMPT = ('Listen to the attached audio clip. Transcribe EXACTLY what is spoken: it may be a single letter name, an isolated speech sound '
                '(a phoneme like /b/ or /æ/ with no word), a word, or a short sentence. '
                'Answer in ONE line in exactly this format and nothing else: '
                'TRANSCRIPT=<what was spoken, as plain text> | TYPE=<letter-name|isolated-sound|word|sentence|noise|silence> | '
                'IPA=<IPA of what was spoken> | NOTE=<for an isolated consonant sound say "clean" if no vowel was added after it, '
                'or "extra vowel" if a vowel like uh was added; for words or sentences note anything missing, extra or mispronounced; otherwise "ok">')


def check(wav_bytes, key, model):
    """후보 wav 를 보내 무엇을 말했는지 묻는다 (자동 검사). 결과 dict {transcript, type, ipa, note, raw}."""
    body = {'contents': [{'parts': [{'text': CHECK_PROMPT}, {'inline_data': {'mime_type': 'audio/wav', 'data': base64.b64encode(wav_bytes).decode()}}]}],
            'generationConfig': {'temperature': 0}}
    res = _post(TTS_URL.format(model=model), body, key, timeout=90)
    text = ''
    for cand in res.get('candidates', []):
        for part in (cand.get('content') or {}).get('parts', []):
            if part.get('text'): text += part['text']
    line = text.strip().splitlines()[0] if text.strip() else ''
    out = {'transcript': '', 'type': '', 'ipa': '', 'note': '', 'raw': text.strip()[:400]}
    for seg in line.split('|'):
        if '=' in seg:
            k, v = seg.split('=', 1); k = k.strip().lower(); v = v.strip().strip('<>')
            if k in out: out[k] = v
    return out


# ---------- ffmpeg ----------
def run(args, timeout=120):
    p = subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error'] + args, capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError('ffmpeg 실패: ' + p.stderr.decode('utf-8', 'replace')[-300:])


def duration(path):
    """초 단위 길이 (ffprobe). 실패하면 0."""
    try:
        p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, timeout=30)
        return float(p.stdout.decode().strip() or 0)
    except Exception:
        return 0.0


def to_wav(src, dst):
    """올린 파일(mp3/wav/m4a…)을 24kHz 모노 WAV 후보로."""
    run(['-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', dst])


def cut_front(src, dst, ms, fade_ms=20):
    """단어 음성의 앞부분: 소리가 시작되는 곳부터 ms 밀리초만 남기고 끝에 fade_ms 페이드아웃 (낱소리 후보)."""
    sec = ms / 1000.0; fade = fade_ms / 1000.0
    af = (f'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.01,'
          f'atrim=end={sec:.3f},afade=t=out:st={max(0.0, sec - fade):.3f}:d={fade:.3f}')
    run(['-i', src, '-af', af, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', dst])


def finalize(src, dst):
    """승인한 후보 → 앞뒤 무음 제거, 음량 맞춤(loudnorm I=-16 TP=-1.5), mp3 (libmp3lame q4)."""
    af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,'
          'apad=pad_dur=0.08,loudnorm=I=-16:TP=-1.5:LRA=11')
    run(['-i', src, '-af', af, '-ar', '44100', '-codec:a', 'libmp3lame', '-q:a', '4', dst])
