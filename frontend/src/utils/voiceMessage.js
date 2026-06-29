import sodium from 'libsodium-wrappers-sumo';
import { getBackendUrl } from './config';

let worker = null;
let currentProgressCallback = null;
let initPromise = null;

let configPromise = null;
let cachedConfig = null;
let latestNativeTranscript = "";

export function getTranscriptionConfig() {
    if (cachedConfig) return Promise.resolve(cachedConfig);
    if (configPromise) return configPromise;

    configPromise = fetch(`${getBackendUrl()}/api/config/transcription`)
        .then(res => {
            if (!res.ok) throw new Error("Failed to load transcription config");
            return res.json();
        })
        .then(data => {
            cachedConfig = data;
            return cachedConfig;
        })
        .catch(err => {
            console.error("Failed to load transcription config, using defaults:", err);
            cachedConfig = {
                mode: "local",
                localModel: "Xenova/distil-whisper-small.en",
                localModelVersion: "v1",
                devMode: true
            };
            return cachedConfig;
        });

    return configPromise;
}

function initWorker(modelName) {
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
        worker.postMessage({ type: 'INIT', modelName });
    });
    return initPromise;
}

// Background idle initialization (Non-blocking startup)
const scheduleIdleInit = () => {
    const runInit = async () => {
        try {
            const config = await getTranscriptionConfig();
            if (config.mode === 'local') {
                const modelToLoad = config.localModel === 'native' ? 'distil-whisper/distil-small.en' : config.localModel;
                if (config.devMode) console.log(`[Nexus ASR] Background initializing local model: ${modelToLoad} (${config.localModelVersion || 'v1'})...`);
                const startTime = performance.now();
                await initWorker(modelToLoad);
                if (config.devMode) console.log(`[Nexus ASR] Background model load complete in ${(performance.now() - startTime).toFixed(2)}ms`);
            }
        } catch (e) {
            console.warn("[Nexus ASR] Background initialization deferred/failed:", e);
        }
    };

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => runInit());
    } else {
        setTimeout(runInit, 3000); // Fallback to 3 seconds deferral
    }
};

scheduleIdleInit();

export async function transcribeAudio(audioBlob, onProgress) {
    try {
        console.log("[Nexus ASR A] Audio recorded. Blob size:", audioBlob.size);
        console.log("[Nexus ASR B] Transcription started for blob size:", audioBlob.size);

        currentProgressCallback = onProgress;
        
        // 1. Load transcription configuration dynamically
        const config = await getTranscriptionConfig();
        
        // Native Speech Recognition Bypass
        if (config.mode === 'local' && config.localModel === 'native') {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition && latestNativeTranscript) {
                console.log("[Nexus ASR C] Transcription completed (Native Web Speech). Text:", latestNativeTranscript);
                if (onProgress) {
                    onProgress({ status: 'ready' });
                }
                return latestNativeTranscript;
            } else {
                console.warn("[Nexus ASR] Native SpeechRecognition failed, returned empty, or not supported. Falling back to local WASM worker.");
            }
        }

        const isServerMode = config.mode === 'server';
        const startTime = performance.now();

        if (isServerMode) {
            // Mode 2: Server-Side Fast AI Mode
            if (onProgress) {
                // Instantly notify loading & ready to simulate UI progression smoothly
                onProgress({ status: 'init_start' });
                setTimeout(() => onProgress({ status: 'ready' }), 100);
            }

            const uploadStart = performance.now();
            const formData = new FormData();
            formData.append("file", audioBlob, "voice_message.webm");

            const response = await fetch(`${getBackendUrl()}/api/transcribe`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server transcription request failed: ${response.statusText}`);
            }

            const result = await response.json();
            const totalTime = performance.now() - startTime;

            console.log("[Nexus ASR C] Transcription completed (Server). Text:", result.transcript);

            if (config.devMode) {
                console.log(`[Nexus ASR Benchmarking (Server)]`);
                console.log(`  - Configured Server Model: ${config.localModel} (${config.localModelVersion})`);
                console.log(`  - Upload & Inference API duration: ${(performance.now() - uploadStart).toFixed(2)} ms`);
                console.log(`  - Total transcription latency: ${totalTime.toFixed(2)} ms`);
                console.log(`  - Result: "${result.transcript}"`);
            }

            return result.transcript || "";
        } else {
            // Mode 1: Private Client-Side Mode
            if (onProgress) {
                onProgress({ status: 'init_start' });
            }

            // Ensure worker is loaded with the configured local model
            const modelToLoad = config.localModel === 'native' ? 'distil-whisper/distil-small.en' : config.localModel;
            const w = await initWorker(modelToLoad);

            if (onProgress) {
                onProgress({ status: 'ready' });
            }

            // Audio preprocessing (extract mono float32 channel at 16kHz) for WASM model
            const preprocessStart = performance.now();
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const float32Array = audioBuffer.getChannelData(0);
            const preprocessTime = performance.now() - preprocessStart;

            // Clean up AudioContext immediately to prevent Chrome context limit freezes
            try {
                if (audioContext.state !== 'closed') {
                    audioContext.close();
                }
            } catch (closeErr) {
                console.warn("Failed to close transcription AudioContext:", closeErr);
            }

            const durationSeconds = float32Array.length / 16000;
            const maxNewTokens = Math.max(15, Math.ceil(durationSeconds * 6) + 10);

            return new Promise((resolve, reject) => {
                const transcribeHandler = (e) => {
                    const { status, transcript, error } = e.data;
                    if (status === 'complete') {
                        w.removeEventListener('message', transcribeHandler);
                        currentProgressCallback = null;
                        
                        console.log("[Nexus ASR C] Transcription completed (Local). Text:", transcript);

                        const totalTime = performance.now() - startTime;
                        if (config.devMode) {
                            console.log(`[Nexus ASR Benchmarking (Local)]`);
                            console.log(`  - Configured Local Model: ${config.localModel} (${config.localModelVersion})`);
                            console.log(`  - Preprocessing duration: ${preprocessTime.toFixed(2)} ms`);
                            console.log(`  - Worker Inference duration: ${(totalTime - preprocessTime).toFixed(2)} ms`);
                            console.log(`  - Total transcription latency: ${totalTime.toFixed(2)} ms`);
                            console.log(`  - Result: "${transcript}"`);
                        }
                        
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
        }
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
        this.recognition = null;
        this.recognitionText = '';
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
            this.recognitionText = '';

            // Run Speech Recognition in parallel if configured as native
            const config = await getTranscriptionConfig();
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (config.mode === 'local' && config.localModel === 'native' && SpeechRecognition) {
                try {
                    this.recognition = new SpeechRecognition();
                    this.recognition.continuous = true;
                    this.recognition.interimResults = true;
                    this.recognition.lang = 'en-US';

                    this.recognition.onresult = (event) => {
                        let finalTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            if (event.results[i].isFinal) {
                                finalTranscript += event.results[i][0].transcript;
                            }
                        }
                        if (finalTranscript) {
                            this.recognitionText += (this.recognitionText ? ' ' : '') + finalTranscript;
                        }
                    };

                    this.recognition.onerror = (e) => {
                        console.warn("[Nexus ASR] Native SpeechRecognition error:", e.error);
                    };

                    this.recognition.start();
                    console.log("[Nexus ASR] Native SpeechRecognition session started.");
                } catch (recErr) {
                    console.error("[Nexus ASR] Failed to start native speech recognition:", recErr);
                }
            }

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
            
            if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) {
                    console.warn("Error stopping native recognition:", e);
                }
            }

            this.mediaRecorder.onstop = () => {
                clearInterval(this.interval);
                this.microphone?.disconnect();
                try {
                    if (this.audioContext && this.audioContext.state !== 'closed') {
                        this.audioContext.close();
                    }
                } catch (closeErr) {
                    console.warn("Failed to close audioContext:", closeErr);
                }
                
                // Stop all tracks to release mic light
                this.mediaRecorder.stream.getTracks().forEach(t => t.stop());

                const duration = Math.floor((Date.now() - this.startTime) / 1000);
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                
                latestNativeTranscript = this.recognitionText ? this.recognitionText.trim() : "";
                console.log("[Nexus ASR C] VoiceRecorderSession completed ASR. Text:", latestNativeTranscript);

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
        try {
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
        } catch (closeErr) {
            console.warn("Failed to close audioContext:", closeErr);
        }
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch (e) {
                // ignore
            }
        }
    }
}

// =========================================================
// Hybrid E2EE file encryption logic 
// =========================================================

/**
 * Encrypts an audio blob and text payload using the Double Ratchet flow.
 * Adheres strictly to the one-ratchet-advance-per-message rule.
 */
export async function encryptVoiceMessage(audioBlob, waveform, durationSeconds) {
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
        __voice: true,
        version: 1,
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
