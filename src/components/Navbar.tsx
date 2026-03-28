"use client";

import { useEffect, useState } from "react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-5 transition-all duration-200"
      style={{
        background: scrolled ? "rgba(255, 255, 255, 0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(12px) saturate(1.2)" : "none",
        borderBottom: scrolled ? "1px solid var(--border-light)" : "1px solid transparent",
      }}
    >
      <a href="/" className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: "var(--primary)", color: "white" }}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        </div>
        <span className="font-semibold text-[0.9375rem]" style={{ color: "var(--text-primary)" }}>
          FlowMotion
        </span>
      </a>

      <div className="flex items-center gap-1">
        <a href="#" className="btn-ghost text-[0.8125rem]">Templates</a>
        <button className="btn-secondary text-[0.8125rem]" style={{ padding: "0.375rem 0.875rem" }}>
          Sign In
        </button>
      </div>
    </nav>
  );
}
