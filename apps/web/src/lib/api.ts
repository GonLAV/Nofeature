import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach auth token
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth-storage');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.accessToken) config.headers.Authorization = `Bearer ${state.accessToken}`;
    } catch { /* ignore */ }
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const stored = localStorage.getItem('auth-storage');
        if (stored) {
          const { state } = JSON.parse(stored);
          if (state?.refreshToken) {
            const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken: state.refreshToken });
            const newToken = data.data.accessToken;
            // Update store
            const parsed = JSON.parse(stored);
            parsed.state.accessToken = newToken;
            localStorage.setItem('auth-storage', JSON.stringify(parsed));
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
          }
        }
      } catch { /* force logout */ }
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
