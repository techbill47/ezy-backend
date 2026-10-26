import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`EZY backend listening on 0.0.0.0:${config.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
