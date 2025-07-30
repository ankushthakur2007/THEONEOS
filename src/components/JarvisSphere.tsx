import React from 'react';
import { Bot, BrainCircuit, Mic, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JarvisSphereProps {
  isRecordingUser: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
}

const SphereState: React.FC<{
  icon: React.ReactNode;
  label: string;
  className?: string;
}> = ({ icon, label, className }) => (
  <div className={cn("absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500", className)}>
    {icon}
    <p className="mt-4 text-sm font-medium text-primary-foreground/80">{label}</p>
  </div>
);

export const JarvisSphere: React.FC<JarvisSphereProps> = ({
  isRecordingUser,
  isThinking,
  isSpeaking,
}) => {
  const size = 'w-40 h-40 md:w-48 md:h-48';
  const isIdle = !isRecordingUser && !isThinking && !isSpeaking;

  const getState = () => {
    if (isThinking) return 'thinking';
    if (isRecordingUser) return 'listening';
    if (isSpeaking) return 'speaking';
    return 'idle';
  };

  const currentState = getState();

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={cn(
          size,
          'relative rounded-full bg-primary transition-all duration-500 ease-in-out flex items-center justify-center',
          {
            'animate-pulse-glow': isIdle || isSpeaking,
            'animate-rotate-complex': isThinking,
          }
        )}
      >
        {/* Listening Waves */}
        {isRecordingUser && (
          <>
            <div className="absolute w-full h-full rounded-full border-2 border-blue-300 animate-wave" style={{ animationDelay: '0s' }} />
            <div className="absolute w-full h-full rounded-full border-2 border-blue-300 animate-wave" style={{ animationDelay: '1s' }} />
          </>
        )}

        {/* State Icons */}
        <SphereState icon={<Bot size={48} className="text-primary-foreground" />} label="Idle" className={cn(currentState === 'idle' ? 'opacity-100' : 'opacity-0')} />
        <SphereState icon={<Mic size={48} className="text-primary-foreground" />} label="Listening..." className={cn(currentState === 'listening' ? 'opacity-100' : 'opacity-0')} />
        <SphereState icon={<BrainCircuit size={48} className="text-primary-foreground" />} label="Thinking..." className={cn(currentState === 'thinking' ? 'opacity-100' : 'opacity-0')} />
        <SphereState icon={<Waves size={48} className="text-primary-foreground" />} label="Speaking..." className={cn(currentState === 'speaking' ? 'opacity-100' : 'opacity-0')} />
      </div>
    </div>
  );
};