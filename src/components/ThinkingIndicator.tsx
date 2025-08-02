import React from 'react';
import { motion, type Variants } from 'framer-motion';

// Variants for each individual dot
const dotVariants: Variants = {
  initial: {
    y: "0%",
  },
  animate: {
    y: ["0%", "-70%", "0%"],
    transition: {
      duration: 0.7,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};

// Variants for the container to orchestrate the dots
const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.15, // This will make each dot start its animation 0.15s after the previous one
    },
  },
};

export const ThinkingIndicator: React.FC = () => {
  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="flex gap-1.5 items-center h-full py-1"
    >
      <motion.span variants={dotVariants} className="h-2 w-2 bg-current rounded-full" />
      <motion.span variants={dotVariants} className="h-2 w-2 bg-current rounded-full" />
      <motion.span variants={dotVariants} className="h-2 w-2 bg-current rounded-full" />
    </motion.div>
  );
};