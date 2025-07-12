import { useState, useRef, useEffect, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useSpeechRecognition } from './use-speech-recognition';
import { useTextToSpeech } from './use-text-to-speech';
import { useAIInteraction } from './use-ai-interaction';

interface UseVoiceLoopReturn {
  isVoiceLoopActive: boolean;
  startVoiceLoop: () => void;
  stopVoiceLoop: () => void;
  isRecordingUser: boolean;
  isSpeakingAI: boolean;
  isThinkingAI: boolean;
  currentInterimText: string;
  aiResponseText: string;
  isRecognitionReady: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function useVoiceLoop(supabase: SupabaseClient, session: Session | null): UseVoiceLoopReturn {
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive);

  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');

  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  const {
    listen,
    stopRecognition: srStopRecognition,
    isRecording: srIsRecording,
    currentInterimText: srCurrentInterimText,
    isRecognitionReady,
  } = useSpeechRecognition();

  useEffect(() => {
    setIsRecordingUser(srIsRecording);
  }, [srIsRecording]);

  useEffect(() => {
    setCurrentInterimText(srCurrentInterimText);
  }, [srCurrentInterimText]);

  const {
    speakAIResponse,
    audioRef,
    cancelSpeech,
  } = useTextToSpeech(supabase);

  const {
    processSpeech,
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  const resetAllFlags = useCallback(() => {
    setIsRecordingUser(false);
    setIsSpeakingAI(false);
    setIsThinkingAI(false);
    setCurrentInterimText('');
    setAiResponseText('');
    srStopRecognition();
    cancelSpeech();
  }, [srStopRecognition, cancelSpeech]);

  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      resetAllFlags();

      let userText = '';
      try {
        userText = await listen();
      } catch (error: any) {
        console.warn("Listen phase failed:", error.message);
        if (error.message === "No speech detected.") {
          toast.info("No speech detected. Please try again.");
        } else if (error.message.includes("not-allowed")) {
          toast.error("Microphone access denied. Please enable microphone permissions.");
          setIsVoiceLoopActive(false);
          return;
        } else if (error.message.includes("Speech recognition stopped by user.")) {
          console.log("Listen phase stopped by user.");
          break;
        }
        else {
          toast.error(`Listening error: ${error.message}`);
        }
        continue;
      }

      let aiResponse: { text: string; audioUrl: string | null } | null = null;
      try {
        setIsThinkingAI(true);
        aiResponse = await processSpeech(userText);
      } catch (error: any) {
        console.error("Think phase failed:", error.message);
        toast.error(`AI thinking error: ${error.message}`);
        setIsThinkingAI(false);
        continue;
      }

      setIsThinkingAI(false);

      if (aiResponse && aiResponse.text) {
        try {
          setIsSpeakingAI(true);
          setAiResponseText(aiResponse.text);

          await new Promise<void>((resolve, reject) => {
            if (audioRef.current && aiResponse.audioUrl) {
              audioRef.current.src = aiResponse.audioUrl;
              audioRef.current.onended = () => {
                setIsSpeakingAI(false);
                setAiResponseText('');
                resolve();
              };
              audioRef.current.onerror = (e) => {
                console.error("ElevenLabs Audio Playback Error:", e);
                toast.error("ElevenLabs audio playback failed. Falling back to browser voice.");
                setIsSpeakingAI(false);
                setAiResponseText('');
                const utter = new SpeechSynthesisUtterance(aiResponse.text);
                utter.onend = () => {
                  setIsSpeakingAI(false);
                  setAiResponseText('');
                  resolve();
                };
                utter.onerror = (event) => {
                  console.error('Web Speech API error during fallback:', event.error);
                  toast.error("Browser speech synthesis failed during fallback.");
                  setIsSpeakingAI(false);
                  setAiResponseText('');
                  reject(new Error("Fallback speech failed."));
                };
                window.speechSynthesis.speak(utter);
              };
              audioRef.current.play().catch(e => {
                console.error("Error playing ElevenLabs audio:", e);
                audioRef.current?.onerror?.(new Event('error'));
              });
            } else {
              const utter = new SpeechSynthesisUtterance(aiResponse.text);
              utter.onend = () => {
                setIsSpeakingAI(false);
                setAiResponseText('');
                resolve();
              };
              utter.onerror = (event) => {
                console.error('Web Speech API error:', event.error);
                toast.error("Browser speech synthesis failed.");
                setIsSpeakingAI(false);
                setAiResponseText('');
                reject(new Error("Browser speech failed."));
              };
              window.speechSynthesis.speak(utter);
            }
          });
        } catch (error: any) {
          console.error("Speak phase failed:", error.message);
          toast.error(`AI speaking error: ${error.message}`);
          setIsSpeakingAI(false);
          continue;
        }
      } else {
        console.warn("AI response text was empty, skipping speak phase.");
        continue;
      }
    }
    resetAllFlags();
    toast.info("Voice loop stopped.");
  }, [listen, processSpeech, audioRef, resetAllFlags]);

  const startVoiceLoop = useCallback(() => {
    if (!isVoiceLoopActive) {
      setIsVoiceLoopActive(true);
      runVoiceLoop();
    }
  }, [isVoiceLoopActive, runVoiceLoop]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActive) {
      setIsVoiceLoopActive(false);
      srStopRecognition();
      cancelSpeech();
    }
  }, [isVoiceLoopActive, srStopRecognition, cancelSpeech]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    currentInterimText,
    aiResponseText,
    isRecognitionReady,
    audioRef,
  };
}