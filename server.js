
import 'dotenv/config.js';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import userRouter from './routers/userRouters.js';
import { existsSync, mkdirSync } from 'fs';
import { upload, uploadPath, fullUploadPath } from './config/uploads.js';
import "./cron/rentalStatusCron.js";
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';
import http from 'http';
import ChatController from './controllers/chatController.js';

if (!existsSync(fullUploadPath)) {
    mkdirSync(fullUploadPath, { recursive: true });
}

const app = express();
const server = http.createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(cors()); 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(upload); 
app.use('/uploads', express.static(fullUploadPath));


app.get('/', (req, res) => {
  res.json({ message: 'Server API running' });
});

ChatController.setupChat(server);
app.use('/api', userRouter);


app.use((req, res, next) => {
  res.status(404).json({ message: 'Endpoint not found' });
});


app.use((err, req, res, next) => {
  console.error(err.stack); 
  if (res.headersSent) return next(err);

  return res.status(500).json({
    message: err.message,
    url: req.originalUrl,
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${fullUploadPath}`);
  console.log("Socket.io đã sẵn sàng!"); 
});

export default app;