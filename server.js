const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const connectDB = require("./config/db");
const bootstrapDefaultUsers = require("./config/bootstrap");
const { recordStartupEvent } = require("./services/monitoringService");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await bootstrapDefaultUsers();

  app.listen(PORT, async () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
    await recordStartupEvent({ port: PORT });
  });
};

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
