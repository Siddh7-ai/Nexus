import sodium from 'libsodium-wrappers-sumo';

let worker = null;
let currentProgressCallback = null;
let initPromise = null;

function initWorker() {
    if (worker) return initPromise;
    worker = new Worker(new URL('./whisperWorker.js', import.meta.url), { type: 'module' });
    
    initPromise = new Promise((resolve, reject) => {
        const messageHandler = (e) => {
            const { status, progress, error } = e.data;
            if (status === 'progress' && currentProgressCallback) {
                currentProgressCallback(progress);
            } else if (status === 'ready') {
                worker.removeEventListener('message', messageHandler);
                resolve(worker);
            } else if (status === 'error') {
                worker.removeEventListener('message', messageHandler);
                reject(new Error(error));
            }
        };
        worker.addEventListener('message', messageHandler);
        worker.postMessage({ type: 'INIT' });
    });
    return initPromise;
}

// Proactively pre-initialize ASR pipeline in the worker background on load
(async () => {
    try {
        console.log("Nexus ASR: Proactively pre-initializing Worker pipeline in background...");
        await initWorker();
    } catch (e) {
        console.warn("ASR background pre-initialization failed:", e);
    }
})();

export async function transcribeAudio(audioBlob, onProgress) {
    try {
        currentProgressCallback = onProgress;
        
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const float32Array = audioBuffer.getChannelData(0);
        
        const durationSeconds = float32Array.length / 16000;
        // Tight cap on tokens for short clips to prevent runaway CPU generation (1s -> 15 tokens)
        const maxNewTokens = Math.max(15, Math.ceil(durationSeconds * 6) + 10);

        if (onProgress) {
            onProgress({ status: 'init_start' });
        }
        const w = await initWorker();
        if (onProgress) {
            onProgress({ status: 'ready' });
        }
        
        return new Promise((resolve, reject) => {
            const transcribeHandler = (e) => {
                const { status, transcript, error } = e.data;
                if (status === 'complete') {
                    w.removeEventListener('message', transcribeHandler);
                    currentProgressCallback = null;
                    resolve(transcript ? transcript.trim() : "");
                } else if (status === 'error') {
                    w.removeEventListener('message', transcribeHandler);
                    currentProgressCallback = null;
                    reject(new Error(error));
                }
            };
            w.addEventListener('message', transcribeHandler);
            w.postMessage({ 
                type: 'TRANSCRIBE', 
                audioData: float32Array,
                maxNewTokens
            });
        });
    } catch (err) {
        console.error("Transcription error:", err);
        currentProgressCallback = null;
        return "";
    }
}

export function normalizeWaveform(amplitudeData, targetPoints = 100) {
    if (!amplitudeData || amplitudeData.length === 0) return new Array(targetPoints).fill(0);
    
    const result = new Array(targetPoints);
    const step = amplitudeData.length / targetPoints;
    
    // First pass: chunk and find local max
    let maxAmp = 0;
    for (let i = 0; i < targetPoints; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        let maxInChunk = 0;
        for (let j = start; j < end && j < amplitudeData.length; j++) {
            if (amplitudeData[j] > maxInChunk) {
                maxInChunk = amplitudeData[j];
            }
        }
        result[i] = maxInChunk;
        if (maxInChunk > maxAmp) maxAmp = maxInChunk;
    }
    
    // Normalize to 0-1
    if (maxAmp > 0) {
        for (let i = 0; i < targetPoints; i++) {
            result[i] = result[i] / maxAmp;
        }
    }
    return result;
}

export function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export class VoiceRecorderSession {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.interval = null;
        this.amplitudeData = [];
        this.startTime = 0;
    }

    async start(onAmplitude) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Try to find the best supported codec
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            }

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.audioChunks = [];
            this.amplitudeData = [];

            // Audio Context for amplitude extraction
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            this.interval = setInterval(() => {
                this.analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const v = (dataArray[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                this.amplitudeData.push(rms);
                if (onAmplitude) onAmplitude(rms);
            }, 100);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.startTime = Date.now();
            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.error("Microphone access error:", err);
            throw new Error("Microphone access denied. Please allow microphone in browser settings.");
        }
    }

    async stop() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) return resolve(null);
            
            this.mediaRecorder.onstop = () => {
                clearInterval(this.interval);
                this.microphone?.disconnect();
                this.audioContext?.close();
                
                // Stop all tracks to release mic light
                this.mediaRecorder.stream.getTracks().forEach(t => t.stop());

                const duration = Math.floor((Date.now() - this.startTime) / 1000);
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                
                resolve({
                    audioBlob: blob,
                    amplitudeData: this.amplitudeData,
                    durationSeconds: duration,
                    mimeType: this.mediaRecorder.mimeType
                });
            };
            this.mediaRecorder.stop();
        });
    }

    cancel() {
        if (!this.mediaRecorder) return;
        clearInterval(this.interval);
        this.microphone?.disconnect();
        this.audioContext?.close();
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
}

// =========================================================
// Hybrid E2EE file encryption logic 
// =========================================================

/**
 * Encrypts an audio blob and text payload using the Double Ratchet flow.
 * Adheres strictly to the one-ratchet-advance-per-message rule.
 */
export async function encryptVoiceMessage(audioBlob, transcript, waveform, durationSeconds) {
    await sodium.ready;
    
    // 1. Read raw audio bytes
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBytes = new Uint8Array(arrayBuffer);

    // 2. Generate a random fileKey for symmetric encryption of the audio blob
    const fileKey = sodium.crypto_secretbox_keygen();
    const fileNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

    // 3. Encrypt the audio bytes directly with the fileKey (NO ratchet state change here)
    const encryptedAudioBytes = sodium.crypto_secretbox_easy(audioBytes, fileNonce, fileKey);
    
    // Combine nonce and ciphertext into a single buffer for storage
    const encryptedAudioBlobData = new Uint8Array(fileNonce.length + encryptedAudioBytes.length);
    encryptedAudioBlobData.set(fileNonce, 0);
    encryptedAudioBlobData.set(encryptedAudioBytes, fileNonce.length);
    
    const encryptedAudioBlob = new Blob([encryptedAudioBlobData], { type: 'application/octet-stream' });

    // 4. Build the payload containing the voice metadata AND the one-time fileKey
    const innerPayload = {
        transcript,
        waveform,
        duration: durationSeconds,
        fileKey: sodium.to_base64(fileKey),
        mimeType: audioBlob.type
    };

    const textToEncrypt = JSON.stringify(innerPayload);

    return {
        encryptedAudioBlob,
        textToEncrypt
    };
}

/**
 * Decrypts a voice message file.
 * The ratchet decryption happens elsewhere, providing us the JSON payload containing the fileKey.
 */
export async function decryptVoiceMessageAudio(encryptedAudioBytes, base64FileKey) {
    await sodium.ready;
    
    const fileKey = sodium.from_base64(base64FileKey);
    const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
    
    if (encryptedAudioBytes.length <= nonceLength) {
        throw new Error("Invalid encrypted audio blob size");
    }

    const fileNonce = encryptedAudioBytes.slice(0, nonceLength);
    const ciphertext = encryptedAudioBytes.slice(nonceLength);

    const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, fileNonce, fileKey);
    if (!decryptedBytes) {
        throw new Error("Failed to decrypt audio blob");
    }

    return decryptedBytes;
}
