import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ensureAnalyticsLoaded, trackPageView } from '../services/analytics';

export function AnalyticsProvider() {
  const location = useLocation();

  useEffect(() => {
    ensureAnalyticsLoaded();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
