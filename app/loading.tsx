export default function Loading() {
  return <main className="route-loading" aria-live="polite">
    <div className="container">
      <span className="route-loading-line route-loading-line-short" />
      <span className="route-loading-line route-loading-line-title" />
      <span className="route-loading-line" />
      <span className="route-loading-line" />
    </div>
  </main>;
}
