const configured = (process.env.REACT_APP_API_URL || '/api').replace(/\/+$/, '');
export const API = configured.endsWith('/api') ? configured : `${configured}/api`;
export async function api(path, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'X-Requested-With': 'ApnaBazar', ...(!multipart && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: options.body && !multipart ? JSON.stringify(options.body) : options.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('apna:unauthorized'));
    const error = new Error(data.error || 'Unable to connect. Please try again.'); error.status = response.status; throw error;
  }
  return data;
}
export const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
export const plain = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
