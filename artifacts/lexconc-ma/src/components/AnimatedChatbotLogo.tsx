import { useEffect, useRef, useCallback } from "react";

interface Props {
  size?: number;
  className?: string;
}

export default function AnimatedChatbotLogo({ size = 150, className }: Props) {
  const eyesRef = useRef<SVGGElement>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blink = useCallback(() => {
    const g = eyesRef.current;
    if (!g) return;
    g.style.transition = "transform 0.07s ease-in";
    g.style.transform = "translate(0, 5px) scaleY(0.1)";

    setTimeout(() => {
      if (!mountedRef.current || !eyesRef.current) return;
      eyesRef.current.style.transition = "transform 0.1s ease-out";
      eyesRef.current.style.transform = "translate(0, 0) scaleY(1)";
    }, 80);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const schedule = () => {
      const delay = 8000 + Math.random() * 4000;
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        blink();
        schedule();
      }, delay);
    };
    const init = 3000 + Math.random() * 2000;
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      blink();
      schedule();
    }, init);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [blink]);

  const dark = "#2c6e6e";
  const eye = "#5cad8c";

  return (
    <svg
      viewBox="0 0 260 190"
      width={size}
      height={size * (190 / 260)}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* Left C arc — gap opens right */}
      <path
        d="M 104,74 A 44,44 0 1,0 104,138"
        stroke={dark}
        strokeWidth="23"
        fill="none"
        strokeLinecap="round"
      />

      {/* Left speech bubble tail */}
      <polygon points="79,140 96,136 74,158" fill={dark} />

      {/* Right C arc — gap opens left */}
      <path
        d="M 132,74 A 44,44 0 1,1 132,138"
        stroke={dark}
        strokeWidth="23"
        fill="none"
        strokeLinecap="round"
      />

      {/* Right speech bubble tail */}
      <polygon points="163,136 176,140 182,160" fill={dark} />

      {/* Antenna line */}
      <line
        x1="118"
        y1="66"
        x2="118"
        y2="32"
        stroke={dark}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Antenna ring */}
      <circle cx="118" cy="26" r="6" stroke={dark} strokeWidth="3" fill="none" />

      {/* Eyes group — blinking via JS */}
      <g ref={eyesRef} style={{ transformOrigin: "165px 105px" }}>
        <path
          d="M 150,110 Q 156,100 162,110"
          stroke={eye}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 168,110 Q 174,100 180,110"
          stroke={eye}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
