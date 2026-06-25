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
                whisperPipeline = await pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-small',
                    {
                        progress_callback: (progress) => {
                            self.postMessage({ status: 'progress', progress });
                        }
                    }
                );
            }
            self.postMessage({ status: 'ready' });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    } else if (type === 'TRANSCRIBE') {
        try {
            if (!whisperPipeline) throw new Error('Pipeline not initialized');
            
            // Audio data must be Float32Array at 16kHz
            const result = await whisperPipeline(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
                // Keep prompt very short for whisper-tiny so it doesn't lose focus
                prompt: "Nexus Messenger. Siddharthsinh. Double Ratchet. X3DH. Vault."
            });
            
            console.log("Whisper auto-detect result:", result);
            
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
