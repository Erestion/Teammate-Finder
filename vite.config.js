import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, process.cwd(), '');


  const basePath = env.VITE_BASE_PATH || '/';
  
  return {
    plugins: [react()],
    

    base: basePath, 
    
    server: {

      proxy: {
        '/api': { 

          target: 'http://localhost:4000', 
          changeOrigin: true,

        },
      },
    },
  };
});