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
      className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-6 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(228, 232, 240, 0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        boxShadow: scrolled ? "0 2px 10px var(--neu-shadow-dark)" : "none",
      }}
    >
      {/* Logo — neumorphic raised pill */}
      <a href="/" className="flex items-center gap-2.5 group">
        <div
          className="neu-raised-sm flex h-8 w-8 items-center justify-center transition-all duration-300"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" style={{ color: "var(--primary)" }}>
            <path d="M8 5.14v14l11-7-11-7z" fill="currentColor" />
          </svg>
        </div>
        <span className="font-serif font-semibold text-lg" style={{ color: "var(--on-surface)" }}>
          FlowMotion
        </span>
      </a>

      {/* Right nav */}
      <div className="flex items-center gap-2">
        <a
          href="#"
          className="text-sm font-medium px-3 py-1.5 transition-all duration-200"
          style={{ color: "var(--on-surface-variant)", borderRadius: "var(--radius-md)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--on-surface)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--on-surface-variant)";
          }}
        >
          Templates
        </a>
        <button className="neu-button text-sm px-4 py-2" style={{ color: "var(--primary)" }}>
          Sign In
        </button>
      </div>
    </nav>
  );
}
