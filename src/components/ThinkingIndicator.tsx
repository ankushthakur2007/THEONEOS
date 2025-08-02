import React from 'react';
import { motion, type Variants } from 'framer-motion';

const dotVariants: Variants = {
  initial: {
    y: "0%",
  },
  animate: {
    y: ["0%", "-60%", "0%"],
  },
};

const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.15,
      repeat: Infinity,
      duration: 0.8,
      ease: "easeInOut",
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