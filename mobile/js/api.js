/* PDKS Mobile - API Communication Layer */
const API = {
  baseUrl: window.location.origin,
  token: localStorage.getItem('pdks_token'),

  setToken(token) {
    this.token = token;
    localStorage.setItem('pdks_token', token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('pdks_token');
    localStorage.removeItem('pdks_user');
  },

  getUser() {
    const u = localStorage.getItem('pdks_user');
    return u ? JSON.parse(u) : null;
  },

  setUser(user) {
    localStorage.setItem('pdks_user', JSON.stringify(user));
  },

  async request(method, endpoint, data, isFormData) {
    const headers = {
      'bypass-tunnel-reminder': 'true'
    };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const config = { method, headers };
    if (data) {
      config.body = isFormData ? data : JSON.stringify(data);
    }

    try {
      const res = await fetch(this.baseUrl + endpoint, config);
      const json = await res.json();
      
      if (res.status === 401) {
        if (endpoint === '/api/auth/login') {
          return { success: false, error: json.error || 'Gecersiz kullanici adi veya sifre' };
        }
        this.clearToken();
        if (typeof showScreen === 'function') showScreen('login-screen');
        return { success: false, error: 'Oturum suresi dolmus' };
      }
      return json;
    } catch (err) {
      console.error('API Hatasi:', err);
      return { success: false, error: 'Baglanti hatasi' };
    }
  },

  login(username, password) {
    return this.request('POST', '/api/auth/login', { username, password });
  },

  getMe() {
    return this.request('GET', '/api/auth/me');
  },

  async checkIn(qrData, lat, lng, selfieBlob) {
    const fd = new FormData();
    fd.append('qr_data', qrData);
    fd.append('latitude', lat);
    fd.append('longitude', lng);
    if (selfieBlob) fd.append('selfie', selfieBlob, 'selfie.jpg');
    return this.request('POST', '/api/attendance/check-in', fd, true);
  },

  async checkOut(qrData, lat, lng, selfieBlob) {
    const fd = new FormData();
    fd.append('qr_data', qrData);
    fd.append('latitude', lat);
    fd.append('longitude', lng);
    if (selfieBlob) fd.append('selfie', selfieBlob, 'selfie.jpg');
    return this.request('POST', '/api/attendance/check-out', fd, true);
  },

  heartbeat(lat, lng) {
    return this.request('POST', '/api/attendance/heartbeat', { latitude: lat, longitude: lng });
  },

  getMyStatus() {
    return this.request('GET', '/api/attendance/my-status');
  },

  getMyHistory(page) {
    return this.request('GET', '/api/attendance/my-history?page=' + (page || 1));
  }
};
