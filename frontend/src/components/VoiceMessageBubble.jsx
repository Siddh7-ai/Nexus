import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { decryptVoiceMessageAudio, formatDuration } from '../utils/voiceMessage';

export default function VoiceMessageBubble({ 
    fileUrl, 
    encryptedPayload, 
    isE2EE, 
    isOwnMessage, 
    duration, 
    waveform, 
    transcript 
}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [isDecrypted, setIsDecrypted] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [localAudioUrl, setLocalAudioUrl] = useState(null);
    const [transcriptExpanded, setTranscriptExpanded] = useState(false);
    const [error, setError] = useState(null);
    
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

    // Handle audio time update
    useEffect(() => {
        if (!audioRef.current) return;
        
        const updateTime = () => setPlaybackTime(audioRef.current.currentTime);
        const onEnd = () => {
            setIsPlaying(false);
            setPlaybackTime(0);
        };
        
        audioRef.current.addEventListener('timeupdate', updateTime);
        audioRef.current.addEventListener('ended', onEnd);
        
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('timeupdate', updateTime);
                audioRef.current.removeEventListener('ended', onEnd);
            }
        };
    }, [localAudioUrl]);

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
            
            setLocalAudioUrl(url);
            setIsDecrypted(true);
            setIsDecrypting(false);
            return url;
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
            url = await fetchAndDecryptAudio();
            if (!url) return;
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

    const displayWaveform = waveform && waveform.length > 0 ? waveform : new Array(40).fill(0.1);
    const playProgress = duration > 0 ? (playbackTime / duration) : 0;

    return (
        <div className={`voice-message-bubble ${isOwnMessage ? 'own' : 'other'}`}>
            {isE2EE && <div className="e2ee-badge" title="End-to-End Encrypted"><Lock size={12} /></div>}
            
            <div className="voice-message-header">
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
                
                <div className="voice-waveform">
                    {displayWaveform.map((val, i) => {
                        const isPlayed = (i / displayWaveform.length) <= playProgress;
                        return (
                            <div 
                                key={i} 
                                className={`waveform-bar ${isPlayed ? 'played' : ''}`}
                                style={{ height: `${Math.max(10, val * 100)}%` }}
                            />
                        );
                    })}
                </div>
                
                <div className="voice-duration">
                    {formatDuration(isPlaying ? playbackTime : duration)}
                </div>
            </div>

            {error && <div className="voice-error">{error}</div>}

            {transcript && (
                <div className="voice-transcript-container">
                    <div className={`voice-transcript ${transcriptExpanded ? 'expanded' : 'collapsed'}`}>
                        {transcript}
                    </div>
                    {transcript.length > 100 && (
                        <button 
                            className="transcript-toggle"
                            onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                        >
                            {transcriptExpanded ? (
                                <>Show less <ChevronUp size={14} /></>
                            ) : (
                                <>Show more <ChevronDown size={14} /></>
                            )}
                        </button>
                    )}
                </div>
            )}
            
            {localAudioUrl && (
                <audio ref={audioRef} src={localAudioUrl} preload="auto" style={{ display: 'none' }} />
            )}
        </div>
    );
}
