import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import courseRoutes from './routes/courses.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';
import { requireAuth, serializeUser } from './middleware/auth.js';

export const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.get('/api/me', requireAuth, (req, res) => res.json(serializeUser(req.user)));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((error, req, res, _next) => {
  console.error(error.message, req.method, req.path);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  res.status(500).json({ error: 'An unexpected error occurred.' });
});
