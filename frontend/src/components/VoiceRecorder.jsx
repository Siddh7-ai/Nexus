import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause } from 'lucide-react';
import { VoiceRecorderSession, normalizeWaveform, formatDuration } from '../utils/voiceMessage';



export default function VoiceRecorder({ onVoiceMessageReady, onCancel, onRecordingStart, onRecordingStop }) {
    const [state, setState] = useState('idle'); // 'idle', 'recording', 'preview', 'processing'
    const [duration, setDuration] = useState(0);
    const [amplitude, setAmplitude] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [amplitudeData, setAmplitudeData] = useState([]);
    
    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    
    // Handle high-precision progress tracking via requestAnimationFrame (60+ FPS)
    useEffect(() => {
        if (!isPlaying || !audioRef.current) return;
        
        let animationFrameId;
        
        const updateProgress = () => {
            if (audioRef.current) {
                setPlaybackTime(audioRef.current.currentTime);
                animationFrameId = requestAnimationFrame(updateProgress);
            }
        };
        
        animationFrameId = requestAnimationFrame(updateProgress);
        
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                URL.revokeObjectURL(audioRef.current.src);
            }
        };
    }, []);

    const sessionRef = useRef(null);
    const timerRef = useRef(null);
    const audioRef = useRef(null);
    const micButtonRef = useRef(null);

    // Slide-to-cancel refs
    const startXRef = useRef(null);
    const isHoldingRef = useRef(false);
    const isLockedRef = useRef(false);
    const pointerDownTimeRef = useRef(0);
    const stateRef = useRef(state);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        return () => {
            if (sessionRef.current) {
                sessionRef.current.cancel();
            }
            if (timerRef.current) clearInterval(timerRef.current);
            if (audioRef.current) {
                audioRef.current.pause();
                URL.revokeObjectURL(audioRef.current.src);
            }
            if (stateRef.current === 'recording' && onRecordingStop) {
                onRecordingStop();
            }
        };
    }, [onRecordingStop]);

    const startRecording = async () => {
        if (state !== 'idle') return;
        setState('starting');
        try {
            sessionRef.current = new VoiceRecorderSession();
            await sessionRef.current.start((amp) => setAmplitude(amp));
            setState('recording');
            if (onRecordingStart) onRecordingStart();
            setDuration(0);
            setAmplitudeData([]);
            
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    if (prev >= 300) { // 5 minutes max limit
                        stopRecording();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);
        } catch (err) {
            alert(err.message);
            setState('idle');
        }
    };

    const stopRecording = async () => {
        if (!sessionRef.current || state !== 'recording') return;
        setState('stopping');
        
        clearInterval(timerRef.current);
        const result = await sessionRef.current.stop();
        
        if (!result || result.durationSeconds < 1) {
            // Too short
            alert("Recording too short");
            setState('idle');
            if (onRecordingStop) onRecordingStop();
            return;
        }

        setAudioBlob(result.audioBlob);
        setAmplitudeData(result.amplitudeData);
        setDuration(result.durationSeconds);
        setState('preview');
        if (onRecordingStop) onRecordingStop();
        
        // Setup audio element for playback
        if (audioRef.current) {
            URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = new Audio(URL.createObjectURL(result.audioBlob));
        audioRef.current.onended = () => {
            setIsPlaying(false);
            setPlaybackTime(0);
        };
        audioRef.current.onpause = () => {
            setIsPlaying(false);
        };
        audioRef.current.onplay = () => {
            setIsPlaying(true);
        };
    };

    const cancelRecording = () => {
        if (sessionRef.current) {
            sessionRef.current.cancel();
        }
        clearInterval(timerRef.current);
        
        // Stop any active preview audio
        if (audioRef.current) {
            audioRef.current.pause();
            URL.revokeObjectURL(audioRef.current.src);
            audioRef.current = null;
        }
        setIsPlaying(false);
        setPlaybackTime(0);

        setState('idle');
        if (onRecordingStop) onRecordingStop();
        if (onCancel) onCancel();
    };

    const handleSend = async () => {
        if (!audioBlob) return;
        setState('processing');

        // Stop any active preview audio
        if (audioRef.current) {
            audioRef.current.pause();
            URL.revokeObjectURL(audioRef.current.src);
            audioRef.current = null;
        }
        setIsPlaying(false);
        setPlaybackTime(0);

        const normalizedWaveform = normalizeWaveform(amplitudeData, 100);

        if (onVoiceMessageReady) {
            await onVoiceMessageReady({
                audioBlob,
                transcript: "", // Backend will transcribe asynchronously
                waveform: normalizedWaveform,
                durationSeconds: duration
            });
        }
        
        setState('idle');
        setAudioBlob(null);
    };

    const togglePlayback = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    // Pointer events for hold-to-record, slide-to-cancel, and click-to-stop
    const handlePointerDown = (e) => {
        if (state === 'recording') {
            // Click to stop if already locked
            stopRecording();
            return;
        }
        if (state !== 'idle') return;
        
        try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
        isHoldingRef.current = true;
        isLockedRef.current = false;
        startXRef.current = e.clientX;
        pointerDownTimeRef.current = Date.now();
        startRecording();
    };

    const handlePointerMove = (e) => {
        if (!isHoldingRef.current || state !== 'recording') return;
        const currentX = e.clientX;
        const diff = startXRef.current - currentX;
        
        // Slide left to cancel (made easier: 50px instead of 100px)
        if (diff > 50) {
            isHoldingRef.current = false;
            isLockedRef.current = false;
            try { e.target.releasePointerCapture(e.pointerId); } catch (err) {}
            cancelRecording();
        }
    };

    const handlePointerUp = (e) => {
        if (!isHoldingRef.current) return;
        try { e.target.releasePointerCapture(e.pointerId); } catch (err) {}
        isHoldingRef.current = false;
        
        if (state === 'recording') {
            const holdDuration = Date.now() - pointerDownTimeRef.current;
            if (holdDuration < 400) {
                // Short tap -> lock recording mode (don't stop)
                isLockedRef.current = true;
            } else {
                // Long press -> stop recording on release
                stopRecording();
            }
        }
    };

    const handlePointerLeave = (e) => {
        if (isHoldingRef.current && !isLockedRef.current && state === 'recording') {
            isHoldingRef.current = false;
            stopRecording();
        }
    };

    if (state === 'processing') {
        return (
            <div className="voice-recorder-processing">
                <div className="processing-loader">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div className="processing-text">
                    Sending voice message...
                </div>
            </div>
        );
    }

    if (state === 'preview') {
        const normalizedWaveform = normalizeWaveform(amplitudeData, 40); // 40 bars for preview UI
        const displayTime = (isPlaying || playbackTime > 0) ? playbackTime : duration;
        const playProgress = duration > 0 ? (playbackTime / duration) : 0;

        return (
            <div className="voice-recorder-preview">
                <button className="preview-action-btn" onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                
                <div className="voice-waveform-container" style={{ width: '100px', flexGrow: 0 }}>
                    {/* Background Waveform (gray) */}
                    <div className="preview-waveform voice-waveform-bg">
                        {normalizedWaveform.map((val, i) => (
                            <div 
                                key={i} 
                                className="waveform-bar"
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        ))}
                    </div>
                    {/* Progress Waveform Overlay (cyan with clip-path) */}
                    <div 
                        className="preview-waveform voice-waveform-progress"
                        style={{ 
                            clipPath: `inset(0 ${100 - playProgress * 100}% 0 0)`,
                            WebkitClipPath: `inset(0 ${100 - playProgress * 100}% 0 0)`
                        }}
                    >
                        {normalizedWaveform.map((val, i) => (
                            <div 
                                key={i} 
                                className="waveform-bar played"
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        ))}
                    </div>
                </div>
                
                <span className="preview-time">{formatDuration(displayTime)}</span>
                
                <button className="preview-action-btn discard" onClick={cancelRecording} title="Discard">
                    <Trash2 size={20} />
                </button>
                <button className="preview-action-btn send" onClick={handleSend} title="Send">
                    <Send size={20} />
                </button>
            </div>
        );
    }

    return (
        <div 
            className={`voice-recorder-idle ${state === 'recording' ? 'is-recording' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerUp}
            ref={micButtonRef}
            style={{ touchAction: 'none' }}
        >
            {state === 'recording' ? (
                <div className="recording-active">
                    <div className="recording-tooltip">
                        📢 Please speak in <b>English</b> for better assistance.
                    </div>
                    <div className="recording-pulse" style={{ transform: `scale(${1 + amplitude * 2})` }}></div>
                    <Mic size={24} className="mic-icon-active" />
                    <span className="recording-timer">{formatDuration(duration)}</span>
                    <span className="slide-to-cancel">
                        {isLockedRef.current ? "Click mic to stop" : "← Slide to cancel"}
                    </span>
                </div>
            ) : (
                <button className="mic-btn" type="button" title="Hold or Click to Record">
                    <Mic size={20} />
                </button>
            )}
        </div>
    );
}
