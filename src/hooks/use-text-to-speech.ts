import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { SupabaseClient } from '@supabase/supabase-js';

interface UseTextToSpeechReturn {
  speakAIResponse: (text: string) => Promise<string | null>;
  isSpeakingAI: boolean;
  aiResponseText: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  cancelSpeech: () => void;
}

export function useTextToSpeech(
  supabase: SupabaseClient,
  // Removed onSpeechEnd and onSpeechError as they are now handled by runVoiceLoop
): UseTextToSpeechReturn {
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [aiResponseText, setAiResponseText] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SPEECH_TIMEOUT_MS = 120000; // 2 minutes

  const cancelSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      console.log("SpeechSynthesis: Canceled existing speech.");
    }
    if (speechTimeoutIdRef.current) {
      clearTimeout(speechTimeoutIdRef.current);
      speechTimeoutIdRef.current = null;
    }
  }, []);

  // playAudioAndThenListen and speakWithWebSpeechAPI will no longer call external callbacks.
  // Their internal onended/onerror will just manage local state.
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText);

      audioRef.current.play().then(() => {
        console.log("ElevenLabs Audio: Playback started.");
      }).catch(e => {
        console.error("Error attempting to play ElevenLabs audio:", e);
        toast.error(`Audio playback failed: ${e.message}.`);
        setIsSpeakingAI(false);
        // onSpeechError(); // Removed external callback
      });

      audioRef.current.onended = () => {
        console.log("ElevenLabs Audio: Playback ended.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        // onSpeechEnd(); // Removed external callback
      };

      audioRef.current.onerror = () => {
        console.error("ElevenLabs Audio: Playback error event.");
        toast.error("Audio playback error.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        // onSpeechError(); // Removed external callback
      };
    }
  }, []); // Removed onSpeechEnd, onSpeechError from dependencies

  const speakWithWebSpeechAPI = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn("Web Speech API: Not supported.");
      toast.error("Browser does not support Web Speech API for text-to-speech.");
      setIsSpeakingAI(false);
      setAiResponseText('');
      // onSpeechError(); // Removed external callback
      return;
    }

    const resetSpeechState = () => {
      setIsSpeakingAI(false);
      setAiResponseText('');
      if (speechTimeoutIdRef.current) {
        clearTimeout(speechTimeoutIdRef.current);
        speechTimeoutIdRef.current = null;
      }
      // onSpeechEnd(); // Removed external callback
    };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      console.log("Web Speech API: Speech started.");
      setIsSpeakingAI(true);
      setAiResponseText(text);
      if (speechTimeoutIdRef.current) {
        clearTimeout(speechTimeoutIdRef.current);
      }
      speechTimeoutIdRef.current = setTimeout(() => {
        console.warn("Web Speech API: Speech timeout reached, forcing restart.");
        window.speechSynthesis.cancel();
        resetSpeechState();
      }, SPEECH_TIMEOUT_MS);
    };

    utterance.onend = () => {
      console.log("Web Speech API: Speech ended.");
      resetSpeechState();
    };

    utterance.onerror = (event) => {
      console.error('Web Speech API error:', event.error);
      toast.error("Browser speech synthesis failed.");
      resetSpeechState();
      // onSpeechError(); // Removed external callback
    };

    console.log("Web Speech API: Attempting to speak full text.");
    window.speechSynthesis.speak(utterance);
  }, []); // Removed onSpeechEnd, onSpeechError from dependencies

  const speakAIResponse = useCallback(async (aiText: string): Promise<string | null> => {
    let audioUrl: string | null = null;
    let ttsAttempted = false;

    try {
      const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text: aiText },
      });

      if (elevenLabsResponse.error || !elevenLabsResponse.data || typeof elevenLabsResponse.data !== 'object' || typeof elevenLabsResponse.data.audioUrl !== 'string' || !elevenLabsResponse.data.audioUrl) {
        console.warn('ElevenLabs TTS failed or no valid audio URL received, attempting fallback to Web Speech API:', elevenLabsResponse.error?.message || 'Invalid data or no audio URL');
        speakWithWebSpeechAPI(aiText);
        ttsAttempted = true;
        toast.info("ElevenLabs failed, using browser's voice.");
      } else {
        audioUrl = elevenLabsResponse.data.audioUrl;
        playAudioAndThenListen(audioUrl, aiText);
        ttsAttempted = true;
      }
    } catch (elevenLabsError: any) {
      console.warn('ElevenLabs TTS failed completely, attempting fallback to Web Speech API:', elevenLabsError.message);
      speakWithWebSpeechAPI(aiText);
      ttsAttempted = true;
      toast.info("ElevenLabs failed, using browser's voice.");
    }

    if (!ttsAttempted) {
      console.warn("No TTS method was attempted.");
      // onSpeechError(); // Removed external callback
    }
    return audioUrl;
  }, [supabase, playAudioAndThenListen, speakWithWebSpeechAPI]); // Removed onSpeechError from dependencies

  return {
    speakAIResponse,
    isSpeakingAI,
    aiResponseText,
    audioRef,
    cancelSpeech,
  };
}