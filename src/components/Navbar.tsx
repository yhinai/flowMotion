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
        background: scrolled ? "rgba(15, 15, 15, 0.8)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border-subtle)" : "1px solid transparent",
      }}
    >
      <a href="/" className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: "var(--brand)", color: "var(--brand-text)" }}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        </div>
        <span className="font-semibold text-sm" style={{ color: "var(--text-emphasis)" }}>
          FlowMotion
        </span>
      </a>

      <div className="flex items-center gap-1">
        <a href="#" className="btn-ghost text-sm">Templates</a>
        <button className="btn-secondary text-sm" style={{ padding: "0.375rem 0.75rem" }}>
          Sign In
        </button>
      </div>
    </nav>
  );
}
