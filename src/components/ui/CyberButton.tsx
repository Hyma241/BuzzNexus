'use client';

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface CyberButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'pink' | 'purple' | 'outline' | 'ghost';
  glow?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export default function CyberButton({
  variant = 'pink',
  glow = true,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: CyberButtonProps) {
  const baseStyle = "relative overflow-hidden font-orbitron font-semibold uppercase tracking-widest text-xs py-3 px-6 rounded-md transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer select-none focus:outline-none";
  
  const widthStyle = fullWidth ? "w-full" : "";
  
  let variantStyle = "";
  if (disabled) {
    variantStyle = "bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed";
  } else if (variant === 'pink') {
    variantStyle = `bg-[#FF4DCA] text-black border border-[#FF4DCA] hover:bg-transparent hover:text-[#FF4DCA] ${glow ? 'shadow-glow-pink hover:shadow-none' : ''}`;
  } else if (variant === 'purple') {
    variantStyle = `bg-[#8B5CF6] text-white border border-[#8B5CF6] hover:bg-transparent hover:text-[#8B5CF6] ${glow ? 'shadow-glow-purple hover:shadow-none' : ''}`;
  } else if (variant === 'outline') {
    variantStyle = "bg-transparent text-white border border-neutral-700 hover:border-[#FF4DCA] hover:text-[#FF4DCA] hover:shadow-[0_0_12px_rgba(255,77,202,0.2)]";
  } else if (variant === 'ghost') {
    variantStyle = "bg-transparent text-neutral-400 hover:text-white";
  }

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      className={`${baseStyle} ${widthStyle} ${variantStyle} ${className}`}
      disabled={disabled}
      {...(props as any)}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}
