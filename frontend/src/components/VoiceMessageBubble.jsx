import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Lock, FileText, Loader2 } from 'lucide-react';
import { decryptVoiceMessageAudio, formatDuration, normalizeWaveform } from '../utils/voiceMessage';
import { getBackendUrl } from '../utils/config';

export default function VoiceMessageBubble({ 
    fileUrl, 
    encryptedPayload, 
    isE2EE, 
    isOwnMessage, 
    duration, 
    waveform, 
    messageId
}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [isDecrypted, setIsDecrypted] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [localAudioUrl, setLocalAudioUrl] = useState(null);
    const [decryptedBlob, setDecryptedBlob] = useState(null);
    const [error, setError] = useState(null);
    
    // Transcript state
    const [transcriptVisible, setTranscriptVisible] = useState(false);
    const [transcriptText, setTranscriptText] = useState(null); // null = not fetched, "" = silent, "text" = result
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [transcriptError, setTranscriptError] = useState(null);
    
    const audioRef = useRef(null);

    // Initial setup if not E2EE
    useEffect(() => {
        if (!isE2EE && fileUrl) {
            setLocalAudioUrl(fileUrl);
            setIsDecrypted(true);
        }
        return () => {
            if (isE2EE && localAudioUrl) {
                URL.revokeObjectURL(localAudioUrl);
            }
        };
    }, [isE2EE, fileUrl]);

    // Handle audio event listeners
    useEffect(() => {
        if (!audioRef.current) return;
        
        const onEnd = () => {
            setIsPlaying(false);
            setPlaybackTime(0);
        };
        const onPause = () => {
            setIsPlaying(false);
        };
        const onPlay = () => {
            setIsPlaying(true);
        };
        
        audioRef.current.addEventListener('ended', onEnd);
        audioRef.current.addEventListener('pause', onPause);
        audioRef.current.addEventListener('play', onPlay);
        
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('ended', onEnd);
                audioRef.current.removeEventListener('pause', onPause);
                audioRef.current.removeEventListener('play', onPlay);
            }
        };
    }, [localAudioUrl]);

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
    }, [isPlaying, localAudioUrl]);

    // Keep HTML audio element's playbackRate in sync with state
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate, localAudioUrl]);

    const toggleSpeed = (e) => {
        e.stopPropagation(); // Avoid triggering parent click events
        let nextRate = 1;
        if (playbackRate === 1) nextRate = 1.5;
        else if (playbackRate === 1.5) nextRate = 2;
        else if (playbackRate === 2) nextRate = 0.5;
        else nextRate = 1;
        
        setPlaybackRate(nextRate);
    };

    const fetchAndDecryptAudio = async () => {
        try {
            setIsDecrypting(true);
            setError(null);
            
            // 1. Fetch encrypted blob from GridFS
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error("Failed to fetch audio");
            const arrayBuffer = await response.arrayBuffer();
            const encryptedBytes = new Uint8Array(arrayBuffer);
            
            // 2. Decrypt it using the fileKey from the encryptedPayload
            const fileKeyBase64 = encryptedPayload.fileKey; // passed down after ratchet decryption
            if (!fileKeyBase64) throw new Error("No file key found in payload");
            
            const decryptedBytes = await decryptVoiceMessageAudio(encryptedBytes, fileKeyBase64);
            
            // 3. Create blob URL
            const blob = new Blob([decryptedBytes], { type: encryptedPayload.mimeType || 'audio/webm' });
            const url = URL.createObjectURL(blob);
            
            setDecryptedBlob(blob);
            setLocalAudioUrl(url);
            setIsDecrypted(true);
            setIsDecrypting(false);
            return { url, blob };
        } catch (err) {
            console.error("Audio decryption error:", err);
            setError("Failed to decrypt audio");
            setIsDecrypting(false);
            return null;
        }
    };

    const togglePlay = async () => {
        let url = localAudioUrl;
        
        if (isE2EE && !isDecrypted) {
            const decryptRes = await fetchAndDecryptAudio();
            if (!decryptRes || !decryptRes.url) return;
            url = decryptRes.url;
            // Wait for React to set the ref (we need the audio element to be updated with src first)
            setTimeout(() => {
                if (audioRef.current) {
                    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
                }
            }, 50);
            return;
        }

        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
        }
    };

    const handleViewTranscript = async () => {
        // Toggle visibility if already fetched
        if (transcriptText !== null) {
            setTranscriptVisible(!transcriptVisible);
            return;
        }

        setTranscriptLoading(true);
        setTranscriptError(null);
        setTranscriptVisible(true);

        try {
            if (isE2EE) {
                // For E2EE: Decrypt locally, then send to transcription proxy
                let audioBlob = decryptedBlob;
                if (!isDecrypted || !audioBlob) {
                    const decryptRes = await fetchAndDecryptAudio();
                    if (!decryptRes) {
                        throw new Error("Could not decrypt audio for transcription");
                    }
                    audioBlob = decryptRes.blob;
                }
                
                if (!audioBlob) {
                    throw new Error("Could not retrieve decrypted audio blob");
                }

                const formData = new FormData();
                formData.append("file", audioBlob, "voice_message.webm");

                const res = await fetch(`${getBackendUrl()}/api/transcribe`, {
                    method: "POST",
                    body: formData
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Server error: ${res.status}`);
                }
                
                const data = await res.json();
                let text = (data.transcript || "").trim();
                
                if (text === "[BLANK_AUDIO]" || text === "(blank audio)" || text === "[BLANK AUDIO]") {
                    text = "";
                }
                
                setTranscriptText(text);

            } else {
                // For Public: Fetch pre-computed transcript from backend
                if (!messageId) {
                    setTranscriptError("Message ID not available");
                    setTranscriptLoading(false);
                    return;
                }

                const res = await fetch(`${getBackendUrl()}/api/transcript/${messageId}`);
                if (!res.ok) throw new Error("Failed to fetch transcript");
                
                const data = await res.json();

                if (data.status === "ready") {
                    setTranscriptText(data.transcript || "");
                } else {
                    // Transcript not ready yet, retry after 3 seconds
                    setTranscriptText(null);
                    setTimeout(async () => {
                        try {
                            const retryRes = await fetch(`${getBackendUrl()}/api/transcript/${messageId}`);
                            if (retryRes.ok) {
                                const retryData = await retryRes.json();
                                if (retryData.status === "ready") {
                                    setTranscriptText(retryData.transcript || "");
                                } else {
                                    setTranscriptText("");
                                }
                            }
                        } catch (retryErr) {
                            console.error("Transcript retry error:", retryErr);
                            setTranscriptText("");
                        }
                        setTranscriptLoading(false);
                    }, 3000);
                    return; // Don't set loading to false yet
                }
            }
        } catch (err) {
            console.error("Transcript error:", err);
            setTranscriptError("Could not load transcript: " + err.message);
        }
        setTranscriptLoading(false);
    };

    const displayWaveform = waveform && waveform.length > 0 ? normalizeWaveform(waveform, 40) : new Array(40).fill(0.1);
    const playProgress = duration > 0 ? (playbackTime / duration) : 0;
    const displayTime = (isPlaying || playbackTime > 0) ? playbackTime : duration;

    return (
        <div className={`voice-message-bubble ${isOwnMessage ? 'own' : 'other'}`}>
            <div className="voice-message-header">
                {isE2EE && (
                    <div className="e2ee-badge" title="End-to-End Encrypted">
                        <Lock size={13} />
                    </div>
                )}
                <button 
                    className="voice-play-btn" 
                    onClick={togglePlay}
                    disabled={isDecrypting}
                >
                    {isDecrypting ? (
                        <div className="spinner-small" />
                    ) : isPlaying ? (
                        <Pause size={18} />
                    ) : (
                        <Play size={18} className="play-icon-offset" />
                    )}
                </button>
                
                <div className="voice-waveform-container">
                    {/* Background Waveform (gray) */}
                    <div className="voice-waveform voice-waveform-bg">
                        {displayWaveform.map((val, i) => (
                            <div 
                                key={i} 
                                className="waveform-bar"
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        ))}
                    </div>
                    {/* Progress Waveform Overlay (cyan with clip-path) */}
                    <div 
                        className="voice-waveform voice-waveform-progress"
                        style={{ 
                            clipPath: `inset(0 ${100 - playProgress * 100}% 0 0)`,
                            WebkitClipPath: `inset(0 ${100 - playProgress * 100}% 0 0)`
                        }}
                    >
                        {displayWaveform.map((val, i) => (
                            <div 
                                key={i} 
                                className="waveform-bar played"
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        ))}
                    </div>
                </div>
                
                <div className="voice-duration">
                    {formatDuration(displayTime)}
                </div>

                <button 
                    className="voice-speed-btn" 
                    onClick={toggleSpeed}
                    title="Change Playback Speed"
                >
                    {playbackRate}x
                </button>
            </div>

            {error && <div className="voice-error">{error}</div>}

            {/* View Transcript Button — available for both public and E2EE messages */}
            {messageId && (
                <div className="voice-transcript-section">
                    <button 
                        className="view-transcript-btn"
                        onClick={handleViewTranscript}
                        disabled={transcriptLoading}
                    >
                        {transcriptLoading ? (
                            <>
                                <Loader2 size={13} className="transcript-spinner" />
                                <span>Loading transcript...</span>
                            </>
                        ) : transcriptVisible && transcriptText !== null ? (
                            <>
                                <FileText size={13} />
                                <span>Hide Transcript</span>
                            </>
                        ) : (
                            <>
                                <FileText size={13} />
                                <span>View Transcript</span>
                            </>
                        )}
                    </button>

                    {transcriptVisible && (
                        <div className="voice-transcript-content">
                            {transcriptLoading ? (
                                <div className="transcript-loading-text">Transcribing audio...</div>
                            ) : transcriptError ? (
                                <div className="transcript-error-text">{transcriptError}</div>
                            ) : transcriptText === "" ? (
                                <div className="transcript-empty-text">No speech detected</div>
                            ) : transcriptText !== null ? (
                                <div className="transcript-text">{transcriptText}</div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}
            
            {localAudioUrl && (
                <audio ref={audioRef} src={localAudioUrl} preload="auto" style={{ display: 'none' }} />
            )}
        </div>
    );
}
