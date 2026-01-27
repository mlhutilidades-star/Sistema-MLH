import { useEffect, useState } from 'react';

export function useLocalStorage(key: string, initialValue = '') {
  const [value, setValue] = useState(() => {
    const existing = localStorage.getItem(key);
    return existing ?? initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return { value, setValue } as const;
}
