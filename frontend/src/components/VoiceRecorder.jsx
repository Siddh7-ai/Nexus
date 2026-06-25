import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause } from 'lucide-react';
import { VoiceRecorderSession, transcribeAudio, normalizeWaveform, formatDuration } from '../utils/voiceMessage';

export default function VoiceRecorder({ onVoiceMessageReady, onCancel }) {
    const [state, setState] = useState('idle'); // 'idle', 'recording', 'preview', 'processing'
    const [duration, setDuration] = useState(0);
    const [amplitude, setAmplitude] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [amplitudeData, setAmplitudeData] = useState([]);
    
    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    
    // Processing state
    const [progressStatus, setProgressStatus] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);
    
    const sessionRef = useRef(null);
    const timerRef = useRef(null);
    const audioRef = useRef(null);
    const micButtonRef = useRef(null);

    // Slide-to-cancel refs
    const startXRef = useRef(null);
    const isHoldingRef = useRef(false);
    const isLockedRef = useRef(false);
    const pointerDownTimeRef = useRef(0);

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
        };
    }, []);

    const startRecording = async () => {
        try {
            sessionRef.current = new VoiceRecorderSession();
            await sessionRef.current.start((amp) => setAmplitude(amp));
            setState('recording');
            setDuration(0);
            setAmplitudeData([]);
            
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
        
        clearInterval(timerRef.current);
        const result = await sessionRef.current.stop();
        
        if (result.durationSeconds < 1) {
            // Too short
            alert("Recording too short");
            setState('idle');
            return;
        }

        setAudioBlob(result.audioBlob);
        setAmplitudeData(result.amplitudeData);
        setDuration(result.durationSeconds);
        setState('preview');
        
        // Setup audio element for playback
        if (audioRef.current) {
            URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = new Audio(URL.createObjectURL(result.audioBlob));
        audioRef.current.onended = () => {
            setIsPlaying(false);
            setPlaybackTime(0);
        };
        audioRef.current.ontimeupdate = () => {
            setPlaybackTime(audioRef.current.currentTime);
        };
    };

    const cancelRecording = () => {
        if (sessionRef.current) {
            sessionRef.current.cancel();
        }
        clearInterval(timerRef.current);
        setState('idle');
        if (onCancel) onCancel();
    };

    const handleSend = async () => {
        if (!audioBlob) return;
        setState('processing');
        setProgressStatus('Preparing transcription...');
        setProgressPercent(0);

        // Run transcription
        const transcript = await transcribeAudio(audioBlob, (data) => {
            if (data.status === 'downloading' || data.status === 'init' || data.status === 'ready') {
                setProgressStatus(`Downloading voice AI model...`);
                // Use default logic to extract percentage or fake it
                setProgressPercent(Math.round(data.progress || 0));
            } else if (data.status === 'update') {
                setProgressStatus('Transcribing...');
            }
        });

        setProgressStatus('Finalizing...');
        const normalizedWaveform = normalizeWaveform(amplitudeData, 100);

        if (onVoiceMessageReady) {
            await onVoiceMessageReady({
                audioBlob,
                transcript,
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
                <div className="processing-spinner"></div>
                <div className="processing-text">
                    {progressStatus} 
                    {progressStatus.includes('Downloading') && progressPercent > 0 && ` ${progressPercent}%`}
                </div>
            </div>
        );
    }

    if (state === 'preview') {
        const normalizedWaveform = normalizeWaveform(amplitudeData, 40); // 40 bars for preview UI
        const playProgress = duration > 0 ? (playbackTime / duration) : 0;

        return (
            <div className="voice-recorder-preview">
                <button className="preview-action-btn" onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                
                <div className="preview-waveform">
                    {normalizedWaveform.map((val, i) => {
                        const isPlayed = (i / normalizedWaveform.length) <= playProgress;
                        return (
                            <div 
                                key={i} 
                                className={`waveform-bar ${isPlayed ? 'played' : ''}`}
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        );
                    })}
                </div>
                
                <span className="preview-time">{formatDuration(duration)}</span>
                
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
