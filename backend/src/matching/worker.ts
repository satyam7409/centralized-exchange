import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { matchOrder } from "./match.js";

const worker = new Worker(
  "order",
  async (job) => {
    console.log("Processing job:", job.name);
    console.log("Data:", job.data);

    if (job.name === "match-order") {
      const {newOrder,oppositeLevels,user,findUser} = job.data;
      matchOrder(newOrder,oppositeLevels,user,findUser)
      // Actually send email here
      console.log(`Sending welcome email to ${newOrder}`);
    }
  },
  { connection: redis },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed`, err);
});
