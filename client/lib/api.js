export const apiFetch = (apiBase, path, options = {}) =>
  fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...options,
  });
