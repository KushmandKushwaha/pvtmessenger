"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Deliberately avoid logging the error itself: it may contain sensitive application data.
    console.error("Unhandled application error", { digest: error.digest });
  }, [error]);

  return (
    <main className="shell">
      <section className="hero" role="alert">
        <div className="badge">Something went wrong</div>
        <h1>We hit a problem.</h1>
        <p>The application could not complete that request. Try again without exposing any sensitive information in the URL or logs.</p>
        <button className="retry" type="button" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
