const dotenv = require('dotenv');
const app = require('./app');
const connectDatabase = require('./config/db');

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(PORT);
  } catch (error) {
    console.error('Failed to start backend server', error);
    process.exit(1);
  }
};

startServer();
