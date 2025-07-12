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
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive); // For stable callbacks

  // State for UI display
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');

  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  // Speech Recognition Hook (now without external callbacks for final result/error/end)
  const {
    startRecognition: srStartRecognition, // Renamed to avoid conflict
    stopRecognition: srStopRecognition,   // Renamed to avoid conflict
    isRecognitionReady,
    finalTranscriptionRef,
  } = useSpeechRecognition(
    (text) => { /* Handled by runVoiceLoop promise */ },
    (event) => { /* Handled by runVoiceLoop promise */ },
    () => { /* Handled by runVoiceLoop promise */ }
  );

  // Text-to-Speech Hook (now without external callbacks for speech end/error)
  const {
    speakAIResponse,
    audioRef,
    cancelSpeech,
  } = useTextToSpeech(supabase);

  // AI Interaction Hook (now without external callbacks for complete/error)
  const {
    processSpeech,
    // messages, // Expose messages if needed for display in Home.tsx
    // setMessages, // Expose setMessages if needed for external control
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  // Centralized state reset function
  const resetAllFlags = useCallback(() => {
    setIsRecordingUser(false);
    setIsSpeakingAI(false);
    setIsThinkingAI(false);
    setCurrentInterimText('');
    setAiResponseText('');
    finalTranscriptionRef.current = '';
    srStopRecognition(); // Ensure recognition is stopped
    cancelSpeech(); // Ensure any ongoing speech is cancelled
  }, [finalTranscriptionRef, srStopRecognition, cancelSpeech]);


  // The main voice loop logic
  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      resetAllFlags(); // Reset flags at the start of each loop iteration

      // 1. LISTEN
      let userText = '';
      try {
        setIsRecordingUser(true);
        setCurrentInterimText('Listening...');
        userText = await new Promise<string>((resolve, reject) => {
          if (!srStartRecognition) { // Check if the function exists
            return reject(new Error("Speech recognition not initialized."));
          }

          const recognition = (srStartRecognition as any).recognitionRef.current; // Access internal recognition object
          if (!recognition) return reject(new Error("Speech recognition object not found."));

          recognition.onresult = (e: SpeechRecognitionEvent) => {
            let interimTranscript = '';
            let currentFinalTranscript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const transcript = e.results[i][0].transcript;
              if (e.results[i].isFinal) {
                currentFinalTranscript += transcript;
              } else {
                interimTranscript += transcript;
              }
            }
            finalTranscriptionRef.current += currentFinalTranscript;
            setCurrentInterimText(finalTranscriptionRef.current + interimTranscript);
          };

          recognition.onend = () => {
            setIsRecordingUser(false);
            const finalTranscribedText = finalTranscriptionRef.current.trim();
            if (finalTranscribedText) {
              resolve(finalTranscribedText);
            } else {
              reject(new Error("No speech detected."));
            }
          };

          recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            setIsRecordingUser(false);
            console.error('Speech recognition error:', event.error);
            reject(new Error(`Speech recognition error: ${event.error}`));
          };

          srStartRecognition(); // Call the start function from useSpeechRecognition
        });
      } catch (error: any) {
        console.warn("Listen phase failed:", error.message);
        if (error.message === "No speech detected.") {
          toast.info("No speech detected. Please try again.");
        } else if (error.message.includes("not-allowed")) {
          toast.error("Microphone access denied. Please enable microphone permissions.");
          setIsVoiceLoopActive(false); // Critical error, stop loop
          return; // Exit the runVoiceLoop function
        } else {
          toast.error(`Listening error: ${error.message}`);
        }
        continue; // Continue to the next loop iteration
      }

      setIsRecordingUser(false); // Ensure this is false after listening
      setCurrentInterimText(''); // Clear interim text

      // 2. THINK
      let aiResponse: { text: string; audioUrl: string | null } | null = null;
      try {
        setIsThinkingAI(true);
        aiResponse = await processSpeech(userText);
      } catch (error: any) {
        console.error("Think phase failed:", error.message);
        toast.error(`AI thinking error: ${error.message}`);
        setIsThinkingAI(false);
        continue; // Continue to the next loop iteration
      }

      setIsThinkingAI(false); // AI is done thinking

      // 3. SPEAK
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
                // Fallback to Web Speech API if ElevenLabs fails
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
                audioRef.current?.onerror?.(new Event('error')); // Manually trigger onerror for fallback
              });
            } else {
              // Fallback to Web Speech API
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
          continue; // Continue to the next loop iteration
        }
      } else {
        console.warn("AI response text was empty, skipping speak phase.");
        continue; // Continue to the next loop iteration
      }
    }
    // Loop ended, ensure all states are reset
    resetAllFlags();
    toast.info("Voice loop stopped.");
  }, [isRecognitionReady, processSpeech, speakAIResponse, audioRef, finalTranscriptionRef, resetAllFlags, srStartRecognition]);


  const startVoiceLoop = useCallback(() => {
    if (!isVoiceLoopActive) {
      setIsVoiceLoopActive(true);
      // The runVoiceLoop function will be called immediately
      runVoiceLoop();
    }
  }, [isVoiceLoopActive, runVoiceLoop]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActive) {
      setIsVoiceLoopActive(false); // This will break the while loop in runVoiceLoop
      // Explicitly stop all ongoing processes immediately
      srStopRecognition();
      cancelSpeech();
      // The runVoiceLoop will handle the final toast and resetAllFlags when it exits
    }
  }, [isVoiceLoopActive, srStopRecognition, cancelSpeech]);

  // No more auto-effect loop or master watchdog needed, as runVoiceLoop handles the flow.
  // The `isVoiceLoopActive` state change will trigger `runVoiceLoop` or cause it to exit.

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