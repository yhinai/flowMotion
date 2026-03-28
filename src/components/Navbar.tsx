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
        backgroundColor: scrolled ? "rgba(19, 19, 24, 0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(16px) saturate(1.2)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(16px) saturate(1.2)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(73, 68, 86, 0.12)"
          : "1px solid transparent",
      }}
    >
      {/* Logo */}
      <a href="/" className="flex items-center gap-2.5 group">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 group-hover:shadow-[0_0_12px_rgba(92,31,222,0.3)]"
          style={{
            background: "linear-gradient(135deg, var(--primary-container), rgba(92, 31, 222, 0.6))",
          }}
        >
          <svg
            className="h-4 w-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M8 5.14v14l11-7-11-7z"
              fill="currentColor"
            />
          </svg>
        </div>
        <span
          className="font-serif font-semibold text-lg transition-colors duration-200"
          style={{ color: "var(--on-surface)" }}
        >
          FlowMotion
        </span>
      </a>

      {/* Right nav */}
      <div className="flex items-center gap-2">
        <a
          href="#"
          className="text-sm font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
          style={{ color: "var(--on-surface-variant)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--on-surface)";
            e.currentTarget.style.background = "rgba(205, 189, 255, 0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--on-surface-variant)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          Templates
        </a>
        <button className="btn-ghost text-sm" style={{ padding: "0.5rem 1rem" }}>
          Sign In
        </button>
      </div>
    </nav>
  );
}
