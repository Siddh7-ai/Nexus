import os
import sys
import tempfile
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel

app = Flask(__name__)
CORS(app)

# Load configurations from environment
model_name = os.getenv("SERVER_ASR_MODEL", "base.en")
model_version = os.getenv("SERVER_MODEL_VERSION", "v1")
dev_mode = os.getenv("TRANSCRIPTION_DEV_MODE", "true").lower() == "true"

print(f"[Python ASR] Initializing Backend ASR Service...")
print(f"[Python ASR] Model: {model_name} (Version: {model_version})")

# Determine device and load model once during startup
start_time = time.time()
try:
    # Try GPU/CUDA with int8_float16 computation (Faster, same accuracy)
    print("[Python ASR] Attempting to load model on GPU (CUDA) with int8_float16...")
    model = WhisperModel(model_name, device="cuda", compute_type="int8_float16")
    device_used = "cuda"
    compute_used = "int8_float16"
except Exception as gpu_err:
    # Fall back to CPU with int8 quantization
    print(f"[Python ASR] GPU initialization failed: {gpu_err}")
    print("[Python ASR] Falling back to CPU with int8 quantization...")
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        device_used = "cpu"
        compute_used = "int8"
    except Exception as cpu_err:
        print(f"[Python ASR] Fatal: CPU fallback also failed: {cpu_err}")
        sys.exit(1)

load_duration = time.time() - start_time
print(f"[Python ASR] Model loaded successfully in {load_duration:.2f}s on {device_used} ({compute_used})")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    request_start = time.time()
    
    # Save the uploaded audio to a temporary file securely
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"transcribe_{os.urandom(8).hex()}.webm")
    
    try:
        save_start = time.time()
        file.save(temp_path)
        preprocess_duration = time.time() - save_start

        # Perform Whisper speech-to-text inference
        inference_start = time.time()
        
        # Greedy decoding (beam_size=1) for speed, with Silero VAD filtering
        segments, info = model.transcribe(
            temp_path,
            beam_size=1,
            language="en" if model_name.endswith(".en") or "english" in model_name.lower() else None,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Combine transcribed segments
        transcript_text = " ".join([segment.text for segment in segments]).strip()
        inference_duration = time.time() - inference_start
        total_duration = time.time() - request_start

        if dev_mode:
            print(f"[Python ASR Benchmarking]")
            print(f"  - Model: {model_name} ({device_used})")
            print(f"  - File size: {os.path.getsize(temp_path)} bytes")
            print(f"  - Preprocessing time: {preprocess_duration * 1000:.2f} ms")
            print(f"  - Inference time: {inference_duration * 1000:.2f} ms")
            print(f"  - Total request latency: {total_duration * 1000:.2f} ms")
            print(f"  - Result: \"{transcript_text}\"")

        return jsonify({"transcript": transcript_text})

    except Exception as err:
        print(f"[Python ASR Error] Transcription failed: {err}")
        return jsonify({"error": str(err)}), 500
        
    finally:
        # Ensure temporary file is always deleted
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as clean_err:
                print(f"[Python ASR Warning] Failed to clean up temp file {temp_path}: {clean_err}")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "device": device_used,
        "compute_type": compute_used,
        "model": model_name,
        "version": model_version
    })

if __name__ == '__main__':
    # Run service on port 5001 locally
    app.run(host='127.0.0.1', port=5001, debug=False)
