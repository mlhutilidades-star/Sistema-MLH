type GtagFn = (...args: any[]) => void;

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: GtagFn;
  }
}

export function getGaMeasurementId(): string | null {
  const id = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();
  return id && id.length > 0 ? id : null;
}

export function ensureAnalyticsLoaded(): void {
  const id = getGaMeasurementId();
  if (!id) return;

  if (typeof window === 'undefined') return;
  if (window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  } as unknown as GtagFn;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
}

export function trackPageView(path: string) {
  const id = getGaMeasurementId();
  if (!id || !window.gtag) return;
  window.gtag('event', 'page_view', { page_path: path });
}

export function trackEvent(name: string, params?: Record<string, any>) {
  const id = getGaMeasurementId();
  if (!id || !window.gtag) return;
  window.gtag('event', name, params || {});
}
