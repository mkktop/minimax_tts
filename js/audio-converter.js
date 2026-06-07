/**
 * 音频格式转换工具
 * - convertToOpus(blob, options): mp3/wav/pcm 等 → webm/opus (16kHz mono)
 *
 * 应用场景: 小智 ESP32 项目的 TTS 素材 (opus / 16kHz / mono)
 * 注意: 浏览器 MediaRecorder 输出的容器是 WebM，但音频编码是 Opus，
 *       扩展名用 .opus，所有现代播放器和小智 server 都可识别。
 */

(function() {
    /**
     * 把任意可解码音频转码为 Opus 编码的 Blob
     * @param {Blob} inputBlob  源音频（mp3 / wav / pcm / flac 等浏览器可解码的格式）
     * @param {Object} [options]
     * @param {number} [options.sampleRate=16000]  目标采样率（小智协议要求 16000）
     * @param {number} [options.channels=1]        目标声道数（小智协议要求 1）
     * @param {number} [options.bitsPerSecond=32000]  Opus 比特率（语音 32kbps 足够）
     * @returns {Promise<Blob>}                    webm/opus 编码的 Blob
     */
    async function convertToOpus(inputBlob, options = {}) {
        const { sampleRate = 16000, channels = 1, bitsPerSecond = 32000 } = options;

        // 检查 MediaRecorder 是否支持 Opus 编码
        const OpusMime = 'audio/webm;codecs=opus';
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(OpusMime)) {
            throw new Error('当前浏览器不支持 MediaRecorder Opus 编码（建议用 Chrome / Edge / Firefox）');
        }

        // 1. 解码源音频
        const arrayBuffer = await inputBlob.arrayBuffer();
        const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
        decodeCtx.close();

        // 2. 用 OfflineAudioContext 重采样 / 转单声道
        const targetLength = Math.max(1, Math.ceil(audioBuffer.duration * sampleRate));
        const offlineCtx = new OfflineAudioContext(channels, targetLength, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();

        // 3. 流式播放 + MediaRecorder 录制为 webm/opus
        //    必须真的播放一遍才能用 MediaRecorder 抓取流（浏览器限制）
        const playCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const playSource = playCtx.createBufferSource();
        playSource.buffer = renderedBuffer;
        const dest = playCtx.createMediaStreamDestination();
        playSource.connect(dest);

        const recorder = new MediaRecorder(dest.stream, {
            mimeType: OpusMime,
            audioBitsPerSecond: bitsPerSecond
        });

        return new Promise((resolve, reject) => {
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = () => {
                playCtx.close().catch(() => {});
                const opusBlob = new Blob(chunks, { type: 'audio/webm' });
                resolve(opusBlob);
            };
            recorder.onerror = (e) => {
                playCtx.close().catch(() => {});
                reject(e.error || new Error('Opus 编码失败'));
            };

            recorder.start();
            playSource.onended = () => {
                // 等最后一帧数据可用再 stop
                setTimeout(() => recorder.stop(), 50);
            };
            playSource.start(0);
        });
    }

    /**
     * 检查当前环境是否支持 Opus 转码
     */
    function isOpusSupported() {
        return typeof MediaRecorder !== 'undefined'
            && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
    }

    window.AudioConverter = { convertToOpus, isOpusSupported };
})();
