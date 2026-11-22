from pathlib import Path
import soundfile as sf
from misaki import espeak
from misaki.espeak import EspeakG2P
from kokoro_onnx import Kokoro

text = Path("scripts/sophrologie-visualisation-longue.txt").read_text(encoding="utf-8")

fallback = espeak.EspeakFallback(british=False)
g2p = EspeakG2P(language="fr-fr", fallback=fallback)

phonemes, _ = g2p(text)

kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
samples, sample_rate = kokoro.create(
    phonemes,
    voice="ff_siwis",
    speed=0.90,
    is_phonemes=True,
    sentence_pause=0.55,
    clause_pause=0.22,
)

Path("assets/audio").mkdir(parents=True, exist_ok=True)
sf.write("assets/audio/sophrologie-visualisation-longue.wav", samples, sample_rate)
print(f"Generated WAV at {sample_rate} Hz")
