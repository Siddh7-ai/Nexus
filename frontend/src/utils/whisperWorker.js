let pipeline, env;
let whisperPipeline = null;

self.addEventListener('message', async (event) => {
    const { type, audioData } = event.data;

    if (type === 'INIT') {
        try {
            if (!pipeline) {
                // Dynamically import from CDN to completely bypass Vite's bundler bugs with ONNX runtime
                const transformers = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.js');
                pipeline = transformers.pipeline;
                env = transformers.env;
                
                env.allowLocalModels = false;
                env.useBrowserCache = true;
            }

            if (!whisperPipeline) {
                let useWebGPU = false;
                try {
                    if (typeof navigator !== 'undefined' && navigator.gpu) {
                        useWebGPU = true;
                    }
                } catch (e) {
                    console.warn("WebGPU not available in worker context:", e);
                }

                if (useWebGPU) {
                    try {
                        console.log("Attempting WebGPU initialization with fp16...");
                        whisperPipeline = await pipeline(
                            'automatic-speech-recognition',
                            'Xenova/whisper-small',
                            {
                                device: 'webgpu',
                                dtype: 'fp16',
                                progress_callback: (progress) => {
                                    self.postMessage({ status: 'progress', progress });
                                }
                            }
                        );
                    } catch (gpuError) {
                        console.warn("WebGPU initialization failed (falling back to CPU):", gpuError);
                        whisperPipeline = null; // Reset and try CPU fallback
                    }
                }

                // CPU Fallback if WebGPU is not used or failed
                if (!whisperPipeline) {
                    console.log("Initializing CPU / WASM pipeline with q8 quantization...");
                    try {
                        env.backends.onnx.wasm.simd = true;
                        if (typeof SharedArrayBuffer !== 'undefined') {
                            env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 4);
                        } else {
                            env.backends.onnx.wasm.numThreads = 1;
                        }
                    } catch (e) {
                        console.warn("Failed to configure WASM backend options:", e);
                    }

                    whisperPipeline = await pipeline(
                        'automatic-speech-recognition',
                        'Xenova/whisper-small',
                        {
                            device: 'cpu',
                            dtype: 'q8',
                            progress_callback: (progress) => {
                                self.postMessage({ status: 'progress', progress });
                            }
                        }
                    );
                }
            }
            self.postMessage({ status: 'ready' });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    } else if (type === 'TRANSCRIBE') {
        try {
            if (!whisperPipeline) throw new Error('Pipeline not initialized');
            
            // Audio data must be Float32Array at 16kHz
            const durationSeconds = audioData.length / 16000;
            const maxNewTokens = event.data.maxNewTokens || Math.max(15, Math.ceil(durationSeconds * 6) + 10);

            console.time("ASR Worker CPU/GPU Pipeline Execution");
            const result = await whisperPipeline(audioData, {
                language: 'english',
                task: 'transcribe',
                num_beams: 1, // Greedy decoding for 4x speedup
                return_timestamps: false, // Turn off timestamp decoding for maximum speed
                max_new_tokens: maxNewTokens, // Dynamic token cap to prevent silent loops
                ...(durationSeconds > 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
                prompt: "Siddharth, Smit, Jyot, Dharmit." // Bias names spelling
            });
            console.timeEnd("ASR Worker CPU/GPU Pipeline Execution");
            
            console.log("Whisper result:", result);
            
            let finalTranscript = result.text ? result.text.trim() : "";
            if (!finalTranscript) {
                finalTranscript = "[No speech detected - audio may be too short]";
            }
            
            self.postMessage({ status: 'complete', transcript: finalTranscript });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
});
