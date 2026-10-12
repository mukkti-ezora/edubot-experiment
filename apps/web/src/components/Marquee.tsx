import { type ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  speed?: number;
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
}

/**
 * CSS-based infinite horizontal marquee.
 * Duplicates children for seamless loop. Pause on hover.
 * Per design-taste-frontend: max 1 marquee per page.
 */
export function Marquee({
  children,
  speed = 40,
  pauseOnHover = true,
  reverse = false,
  className = "",
}: MarqueeProps) {
  return (
    <div
      className={`marquee-container ${className}`}
      style={{ "--marquee-speed": `${speed}s`, "--marquee-direction": reverse ? "reverse" : "normal" } as React.CSSProperties}
      data-pause={pauseOnHover ? "hover" : undefined}
    >
      <div className="marquee-track" aria-hidden="false">
        {children}
      </div>
      <div className="marquee-track" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export function MarqueeItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`marquee-item ${className}`}>{children}</div>;
}
