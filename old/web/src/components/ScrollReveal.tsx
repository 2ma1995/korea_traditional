'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Visible in server HTML and with reduced motion; animation is progressive enhancement. */
export default function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        element.dataset.revealed = 'true';
        observer.disconnect();
      }
    }, { threshold: 0.08 });
    const reveal = () => {
      if (preference.matches) {
        element.dataset.revealed = 'true';
        observer.disconnect();
      }
    };
    if (!preference.matches && element.getBoundingClientRect().top >= window.innerHeight) {
      element.dataset.revealed = 'false';
      observer.observe(element);
    }
    preference.addEventListener('change', reveal);
    return () => { observer.disconnect(); preference.removeEventListener('change', reveal); };
  }, []);
  return <div ref={ref} className={`scroll-reveal ${className}`}>{children}</div>;
}
