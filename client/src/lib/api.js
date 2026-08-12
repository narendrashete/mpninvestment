async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return new Promise(() => {}); // navigating away; don't resolve into the caller
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  dashboard: (windowDays) =>
    request(`/api/investments/dashboard${windowDays ? `?windowDays=${windowDays}` : ''}`),
  investments: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/api/investments${q ? `?${q}` : ''}`);
  },
  closed: () => request('/api/investments/closed'),
  investment: (id) => request(`/api/investments/${id}`),
  createInvestment: (body) => request('/api/investments', { method: 'POST', body: JSON.stringify(body) }),
  updateInvestment: (id, body) => request(`/api/investments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteInvestment: (id) => request(`/api/investments/${id}`, { method: 'DELETE' }),
  redeemInvestment: (id, body) => request(`/api/investments/${id}/redeem`, { method: 'POST', body: JSON.stringify(body) }),
  renewInvestment: (id, body) => request(`/api/investments/${id}/renew`, { method: 'POST', body: JSON.stringify(body) }),

  createHolding: (body) => request('/api/holdings', { method: 'POST', body: JSON.stringify(body) }),
  updateHolding: (id, body) => request(`/api/holdings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteHolding: (id) => request(`/api/holdings/${id}`, { method: 'DELETE' }),

  searchMf: (q) => request(`/api/prices/search/mf?q=${encodeURIComponent(q)}`),
  searchStock: (q) => request(`/api/prices/search/stock?q=${encodeURIComponent(q)}`),
  quote: (symbol) => request(`/api/prices/quote/${encodeURIComponent(symbol)}`),
  refreshPrices: (force) => request(`/api/prices/refresh${force ? '?force=1' : ''}`, { method: 'POST' }),

  settings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),

  masters: () => request('/api/masters'),
  addMaster: (kind, value) => request(`/api/masters/${kind}`, { method: 'POST', body: JSON.stringify({ value }) }),
  renameMaster: (kind, from, to) => request(`/api/masters/${kind}`, { method: 'PUT', body: JSON.stringify({ from, to }) }),
  deleteMaster: (kind, value) => request(`/api/masters/${kind}`, { method: 'DELETE', body: JSON.stringify({ value }) }),

  licPolicies: () => request('/api/lic'),
  licPolicy: (id) => request(`/api/lic/${id}`),
  createLicPolicy: (body) => request('/api/lic', { method: 'POST', body: JSON.stringify(body) }),
  updateLicPolicy: (id, body) => request(`/api/lic/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLicPolicy: (id) => request(`/api/lic/${id}`, { method: 'DELETE' }),
  addLicPremium: (id, body) => request(`/api/lic/${id}/premiums`, { method: 'POST', body: JSON.stringify(body) }),
  deleteLicPremium: (id, paymentId) => request(`/api/lic/${id}/premiums/${paymentId}`, { method: 'DELETE' }),
  uploadLicDocument: async (id, file) => {
    const form = new FormData();
    form.append('document', file);
    const res = await fetch(`/api/lic/${id}/document`, { method: 'POST', body: form });
    if (res.status === 401) {
      window.location.href = '/login';
      return new Promise(() => {});
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },
  deleteLicDocument: (id) => request(`/api/lic/${id}/document`, { method: 'DELETE' }),
  licDocumentUrl: (id) => `/api/lic/${id}/document`,

  healthPolicies: () => request('/api/health'),
  healthPolicy: (id) => request(`/api/health/${id}`),
  createHealthPolicy: (body) => request('/api/health', { method: 'POST', body: JSON.stringify(body) }),
  updateHealthPolicy: (id, body) => request(`/api/health/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteHealthPolicy: (id) => request(`/api/health/${id}`, { method: 'DELETE' }),
  uploadHealthDocument: async (id, file) => {
    const form = new FormData();
    form.append('document', file);
    const res = await fetch(`/api/health/${id}/document`, { method: 'POST', body: form });
    if (res.status === 401) {
      window.location.href = '/login';
      return new Promise(() => {});
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },
  deleteHealthDocument: (id) => request(`/api/health/${id}/document`, { method: 'DELETE' }),
  healthDocumentUrl: (id) => `/api/health/${id}/document`
};
