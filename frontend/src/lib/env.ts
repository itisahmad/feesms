const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getDefaultApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8000/api';
  }

  return 'https://feesms-be79.vercel.app/api';
};

export const API_BASE_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL || getDefaultApiBaseUrl()
);

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
