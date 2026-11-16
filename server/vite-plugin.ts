import { loadEnv, type Plugin } from 'vite';
import { handleConcepts, handleImage, nodeHandler } from './meta';

/** Dev only: mounts /api/image and /api/concepts. The key is loaded server-side, never exposed to the client. */
export function lociApi(): Plugin {
  return {
    name: 'loci-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      if (env.META_API_KEY) process.env.META_API_KEY = env.META_API_KEY;
      server.middlewares.use('/api/image', nodeHandler(handleImage));
      server.middlewares.use('/api/concepts', nodeHandler(handleConcepts));
    },
  };
}
