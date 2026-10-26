import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import { requireAuth, serializeUser } from './middleware/auth.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.get('/api/me', requireAuth, (req, res) => res.json(serializeUser(req.user)));

app.use((error, _req, res, _next) => {
  console.error('Request failed.');
  res.status(500).json({ error: 'An unexpected error occurred.' });
});
