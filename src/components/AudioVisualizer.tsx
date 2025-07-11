import React from 'react';
import { cn } from '@/lib/utils';

interface AudioVisualizerProps {
  isAnimating: boolean;
  className?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isAnimating, className }) => {
  const barClasses = "w-1 h-full bg-blue-500 rounded-full transition-all duration-100 ease-in-out";

  return (
    <div className={cn("flex items-end justify-center h-10 gap-1", className)}>
      <div className={cn(barClasses, isAnimating ? "animate-bar1" : "h-1")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar2" : "h-2")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar3" : "h-3")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar4" : "h-4")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar5" : "h-5")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar4" : "h-4")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar3" : "h-3")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar2" : "h-2")}></div>
      <div className={cn(barClasses, isAnimating ? "animate-bar1" : "h-1")}></div>
    </div>
  );
};

export default AudioVisualizer;