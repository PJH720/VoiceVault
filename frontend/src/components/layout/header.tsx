import Link from "next/link";
import Navigation from "./Navigation";

export default function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background:   "var(--surface)",
        borderColor:  "var(--border)",
      }}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-widest transition-colors"
          style={{ color: "var(--fg)" }}
        >
          {/* Mic icon */}
          <span
            className="flex h-6 w-6 items-center justify-center border"
            style={{ borderColor: "var(--cyan)", color: "var(--cyan)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2Z" />
              <path
                fillRule="evenodd"
                d="M3.5 7.5a.75.75 0 0 1 .75.75 3.75 3.75 0 0 0 7.5 0 .75.75 0 0 1 1.5 0 5.25 5.25 0 0 1-4.5 5.208V15h1.75a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5H7v-1.542A5.25 5.25 0 0 1 2.75 8.25.75.75 0 0 1 3.5 7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span>
            Voice<span style={{ color: "var(--cyan)" }}>Vault</span>
          </span>
        </Link>

        <Navigation />
      </div>
    </header>
  );
}
