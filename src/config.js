const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

export const API_BASE = base + '/api';

export const SOCKET_URL = base; // для socket.io
