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

// Same response handling as request(), but for multipart bodies (file
// uploads) where a Content-Type header must not be set manually.
async function uploadRequest(url, form) {
  const res = await fetch(url, { method: 'POST', body: form });
  if (res.status === 401) {
    window.location.href = '/login';
    return new Promise(() => {});
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => request('/api/auth/me'),
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
  // `files` (optional) are attachments — receipt PDF, cheque scan, payment
  // screenshot — logged together with the payment in one multipart request.
  addLicPremium: (id, body, files = []) => {
    const form = new FormData();
    if (body.paidOn) form.append('paidOn', body.paidOn);
    form.append('amount', body.amount);
    if (body.notes) form.append('notes', body.notes);
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/lic/${id}/premiums`, form);
  },
  deleteLicPremium: (id, paymentId) => request(`/api/lic/${id}/premiums/${paymentId}`, { method: 'DELETE' }),
  addLicPremiumAttachments: (id, paymentId, files) => {
    const form = new FormData();
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/lic/${id}/premiums/${paymentId}/attachments`, form);
  },
  deleteLicPremiumAttachment: (id, paymentId, attachmentId) =>
    request(`/api/lic/${id}/premiums/${paymentId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  licPremiumAttachmentUrl: (id, paymentId, attachmentId) =>
    `/api/lic/${id}/premiums/${paymentId}/attachments/${attachmentId}`,
  uploadLicDocument: (id, file) => {
    const form = new FormData();
    form.append('document', file);
    return uploadRequest(`/api/lic/${id}/document`, form);
  },
  deleteLicDocument: (id) => request(`/api/lic/${id}/document`, { method: 'DELETE' }),
  licDocumentUrl: (id) => `/api/lic/${id}/document`,

  healthPolicies: () => request('/api/health'),
  healthPolicy: (id) => request(`/api/health/${id}`),
  createHealthPolicy: (body) => request('/api/health', { method: 'POST', body: JSON.stringify(body) }),
  updateHealthPolicy: (id, body) => request(`/api/health/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteHealthPolicy: (id) => request(`/api/health/${id}`, { method: 'DELETE' }),
  uploadHealthDocument: (id, file) => {
    const form = new FormData();
    form.append('document', file);
    return uploadRequest(`/api/health/${id}/document`, form);
  },
  deleteHealthDocument: (id) => request(`/api/health/${id}/document`, { method: 'DELETE' }),
  healthDocumentUrl: (id) => `/api/health/${id}/document`,

  // `files` (optional) are attachments — receipt PDF, cheque scan, payment
  // screenshot — logged together with the payment in one multipart request.
  addHealthPremium: (id, body, files = []) => {
    const form = new FormData();
    if (body.paidOn) form.append('paidOn', body.paidOn);
    form.append('amount', body.amount);
    if (body.notes) form.append('notes', body.notes);
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/health/${id}/premiums`, form);
  },
  deleteHealthPremium: (id, paymentId) => request(`/api/health/${id}/premiums/${paymentId}`, { method: 'DELETE' }),
  addHealthPremiumAttachments: (id, paymentId, files) => {
    const form = new FormData();
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/health/${id}/premiums/${paymentId}/attachments`, form);
  },
  deleteHealthPremiumAttachment: (id, paymentId, attachmentId) =>
    request(`/api/health/${id}/premiums/${paymentId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  healthPremiumAttachmentUrl: (id, paymentId, attachmentId) =>
    `/api/health/${id}/premiums/${paymentId}/attachments/${attachmentId}`,

  // Vehicles own their policies, so every policy/premium path hangs off the
  // vehicle id — that's also what scopes them to the logged-in user's group.
  vehicles: () => request('/api/vehicles'),
  vehicle: (id) => request(`/api/vehicles/${id}`),
  createVehicle: (body) => request('/api/vehicles', { method: 'POST', body: JSON.stringify(body) }),
  updateVehicle: (id, body) => request(`/api/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteVehicle: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE' }),

  createVehiclePolicy: (id, body) =>
    request(`/api/vehicles/${id}/policies`, { method: 'POST', body: JSON.stringify(body) }),
  updateVehiclePolicy: (id, policyId, body) =>
    request(`/api/vehicles/${id}/policies/${policyId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteVehiclePolicy: (id, policyId) =>
    request(`/api/vehicles/${id}/policies/${policyId}`, { method: 'DELETE' }),
  renewVehiclePolicy: (id, policyId, body) =>
    request(`/api/vehicles/${id}/policies/${policyId}/renew`, { method: 'POST', body: JSON.stringify(body) }),

  uploadVehicleDocument: (id, policyId, file) => {
    const form = new FormData();
    form.append('document', file);
    return uploadRequest(`/api/vehicles/${id}/policies/${policyId}/document`, form);
  },
  deleteVehicleDocument: (id, policyId) =>
    request(`/api/vehicles/${id}/policies/${policyId}/document`, { method: 'DELETE' }),
  vehicleDocumentUrl: (id, policyId) => `/api/vehicles/${id}/policies/${policyId}/document`,

  // `files` (optional) are attachments — receipt PDF, cheque scan, payment
  // screenshot — logged together with the payment in one multipart request.
  addVehiclePremium: (id, policyId, body, files = []) => {
    const form = new FormData();
    if (body.paidOn) form.append('paidOn', body.paidOn);
    form.append('amount', body.amount);
    for (const f of ['notes', 'paymentMode', 'referenceNo', 'bankName']) {
      if (body[f]) form.append(f, body[f]);
    }
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/vehicles/${id}/policies/${policyId}/premiums`, form);
  },
  deleteVehiclePremium: (id, policyId, paymentId) =>
    request(`/api/vehicles/${id}/policies/${policyId}/premiums/${paymentId}`, { method: 'DELETE' }),
  addVehiclePremiumAttachments: (id, policyId, paymentId, files) => {
    const form = new FormData();
    files.forEach(f => form.append('attachments', f));
    return uploadRequest(`/api/vehicles/${id}/policies/${policyId}/premiums/${paymentId}/attachments`, form);
  },
  deleteVehiclePremiumAttachment: (id, policyId, paymentId, attachmentId) =>
    request(`/api/vehicles/${id}/policies/${policyId}/premiums/${paymentId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  vehiclePremiumAttachmentUrl: (id, policyId, paymentId, attachmentId) =>
    `/api/vehicles/${id}/policies/${policyId}/premiums/${paymentId}/attachments/${attachmentId}`
};
