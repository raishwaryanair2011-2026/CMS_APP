import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:8000';

// URLs that bypass the 401 auto-refresh logic
const AUTH_URLS = [
  '/api/v1/auth/login/',
  '/api/v1/auth/token/refresh/',
  '/api/v1/admin/doctors/public/',
];

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // IMPORTANT: send cookies with every request so the httpOnly
  // refresh token cookie is included automatically by the browser
  withCredentials: true,
});

// Attach access token (still in sessionStorage) to every request
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-refresh access token on 401 using the httpOnly refresh cookie
let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else       prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl      = originalRequest?.url || '';

    // Never retry auth endpoint failures — pass straight through
    const isAuthUrl = AUTH_URLS.some((u) => requestUrl.includes(u));
    if (isAuthUrl) return Promise.reject(error);

    // 401 on a non-auth request — try to refresh the access token
    if (error.response?.status === 401 && !originalRequest._retry) {

      if (isRefreshing) {
        // Another refresh is already in flight — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing            = true;

      try {
        // POST to our custom refresh endpoint — the browser automatically
        // sends the httpOnly refresh cookie; we never touch it in JS
        const { data } = await axios.post(
          `${BASE_URL}/api/v1/auth/token/refresh/`,
          {},                        // empty body — token comes from cookie
          { withCredentials: true }, // ensure cookie is sent
        );

        const newAccess = data.data?.access || data.access;
        sessionStorage.setItem('access_token', newAccess);
        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);

      } catch (err) {
        processQueue(err, null);
        // Refresh failed (cookie expired or blacklisted) — force re-login
        sessionStorage.removeItem('access_token');
        window.location.href = '/';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;