import { Queue } from "bullmq";

const queue = new Queue("orders:RELIANCE", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

