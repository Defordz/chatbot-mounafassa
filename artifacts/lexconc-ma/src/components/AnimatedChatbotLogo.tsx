import { useEffect, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";

interface Props {
  size?: number;
  className?: string;
}

export default function AnimatedChatbotLogo({ size = 150, className }: Props) {
  const eyeControls = useAnimation();
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 2000;
      blinkTimer.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          await eyeControls.start({
            scaleY: 0.1,
            transition: { duration: 0.08, ease: "easeIn" },
          });
          await eyeControls.start({
            scaleY: 1,
            transition: { duration: 0.12, ease: "easeOut" },
          });
        } catch {}
        if (mountedRef.current) scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => {
      mountedRef.current = false;
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
    };
  }, [eyeControls]);

  const dark = "#1a6b3c";
  const mid = "#2e8b4a";
  const light = "#52b788";

  return (
    <svg
      viewBox="0 0 240 280"
      width={size}
      height={size * (280 / 240)}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* === STATIC BODY === */}
      <g>
        {/* Speech bubble tail */}
        <path d="M138 215 L155 245 L125 222 Z" fill={dark} />

        {/* Main head bubble */}
        <path
          d="M120 120
             C160 120, 185 140, 185 170
             C185 200, 160 218, 120 218
             C80 218, 55 200, 55 170
             C55 140, 80 120, 120 120 Z"
          fill={dark}
        />

        {/* White face */}
        <ellipse cx="120" cy="170" rx="50" ry="38" fill="white" />

        {/* Left headphone */}
        <rect x="48" y="156" width="14" height="28" rx="7" fill={dark} />

        {/* Right headphone */}
        <rect x="178" y="156" width="14" height="28" rx="7" fill={dark} />

        {/* Headband arc */}
        <path
          d="M62 168 C62 125, 90 108, 120 108 C150 108, 178 125, 178 168"
          stroke={dark}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />

        {/* Antenna post */}
        <line x1="120" y1="108" x2="120" y2="72" stroke={dark} strokeWidth="6" strokeLinecap="round" />

        {/* Pivot circle */}
        <circle cx="120" cy="68" r="7" fill={dark} />
        <circle cx="120" cy="68" r="3" fill="white" />
      </g>

      {/* === EYES (BLINKING) === */}
      <motion.g animate={eyeControls} style={{ originX: "120px", originY: "165px" }}>
        {/* Left eye - happy arc */}
        <path
          d="M88 170 C88 155, 104 155, 104 170"
          stroke={mid}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right eye - happy arc */}
        <path
          d="M136 170 C136 155, 152 155, 152 170"
          stroke={mid}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.g>

      {/* === BALANCE / SCALES (ANIMATED) === */}
      <motion.g
        animate={{ rotate: [0, 10, 0, -10, 0] }}
        transition={{
          duration: 3.5,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "loop",
        }}
        style={{ originX: "120px", originY: "68px" }}
      >
        {/* Horizontal bar */}
        <line x1="60" y1="68" x2="180" y2="68" stroke={dark} strokeWidth="5" strokeLinecap="round" />

        {/* Bar end dots */}
        <circle cx="60" cy="68" r="4" fill={dark} />
        <circle cx="180" cy="68" r="4" fill={dark} />

        {/* === LEFT SCALE === */}
        <g>
          {/* Chains */}
          <line x1="60" y1="68" x2="42" y2="100" stroke={dark} strokeWidth="2.5" />
          <line x1="60" y1="68" x2="78" y2="100" stroke={dark} strokeWidth="2.5" />

          {/* Bowl outer */}
          <path
            d="M39 100 Q42 112 60 112 Q78 112 81 100 Z"
            fill={dark}
          />
          {/* Bowl inner */}
          <path
            d="M44 101 Q46 109 60 109 Q74 109 76 101 Z"
            fill={light}
          />
        </g>

        {/* === RIGHT SCALE === */}
        <g>
          {/* Chains */}
          <line x1="180" y1="68" x2="162" y2="100" stroke={dark} strokeWidth="2.5" />
          <line x1="180" y1="68" x2="198" y2="100" stroke={dark} strokeWidth="2.5" />

          {/* Bowl outer */}
          <path
            d="M159 100 Q162 112 180 112 Q198 112 201 100 Z"
            fill={dark}
          />
          {/* Bowl inner */}
          <path
            d="M164 101 Q166 109 180 109 Q194 109 196 101 Z"
            fill={light}
          />
        </g>
      </motion.g>
    </svg>
  );
}
