/**
 * local server entry file, for local development
 */
import app from './app.ts';
import { initDb } from './db/init.ts';

// Initialize database
initDb();

/**
 * start server with port
 */
const basePort = Number(process.env.PORT) || 3001;
let server: ReturnType<typeof app.listen>;

const startServer = (port: number) => {
  server = app.listen(port, () => {
    console.log(`Server ready on port ${port}`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE' && port < basePort + 10) {
      startServer(port + 1);
      return;
    }
    throw err;
  });
};

startServer(basePort);

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
