export const API_BASE = import.meta.env.BASE_URL === '/' 
  ? '/api' 
  : `${import.meta.env.BASE_URL}api`;