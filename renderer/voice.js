// Bloom hidden voice worker: captures the mic as 16kHz mono PCM (for the
// main-process Whisper model) and streams an audio level for the orb animation.
// A capture→transcribe→inject pipeline, implemented
// with Web APIs (no native deps). TTS is handled OS-side in the main process.
'use strict';
(function () {
  const evt = (type, extra) => window.bloom.voiceEvent({ type, ...extra });

  const SAMPLE_RATE = 16000;
  const MAX_SECONDS = 120;              // safety cap; primary stop is an explicit tap/hotkey
  let ctx = null, stream = null, source = null, processor = null, analyser = null;
  let chunks = [];                      // Float32Array[] at 16kHz
  let raf = 0, capping = 0, recording = false;

  async function start() {
    if (recording) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) { evt('error', { message: 'Microphone unavailable' }); return; }

    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    // ScriptProcessor collects the raw PCM; a muted gain keeps it running without echo.
    processor = ctx.createScriptProcessor(4096, 1, 1);
    chunks = [];
    processor.onaudioprocess = e => {
      if (!recording) return;
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    const sink = ctx.createGain(); sink.gain.value = 0;
    source.connect(processor); processor.connect(sink); sink.connect(ctx.destination);

    recording = true;
    evt('listening');
    pumpLevel();
    capping = setTimeout(stop, MAX_SECONDS * 1000);
  }

  // ~60fps RMS → level (0..1) for the pulsing orb.
  function pumpLevel() {
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (!recording) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      evt('level', { value: Math.min(1, rms * 8) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function stop() {
    if (!recording) return;
    recording = false;
    clearTimeout(capping);
    cancelAnimationFrame(raf);
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
    try { await ctx.close(); } catch {}

    // Concatenate all chunks into one Float32Array.
    let len = 0; for (const c of chunks) len += c.length;
    const pcm = new Float32Array(len);
    let off = 0; for (const c of chunks) { pcm.set(c, off); off += c.length; }
    chunks = [];

    if (len < SAMPLE_RATE * 0.3) { evt('result', { text: '' }); return; }  // too short
    try {
      const r = await window.bloom.transcribe(pcm);
      if (r.error) evt('error', { message: r.error });
      else evt('result', { text: r.text || '' });
    } catch (e) { evt('error', { message: e.message || 'Transcription failed' }); }
  }

  // TTS (read-aloud) is handled OS-side in the main process — speechSynthesis has
  // no voices on Linux — so this worker only captures the mic for dictation.
  window.bloom.on('voice-cmd', m => {
    if (m.action === 'start') start();
    else if (m.action === 'stop') stop();
  });
})();
