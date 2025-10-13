import cron from "node-cron";
import moment from "moment-timezone";
import { PrismaClient } from '@prisma/client';
import { runTask } from "./controller/jobs/backup";



const prisma = new PrismaClient();

// 🕑 Schedule backup at 2:00 AM Nairobi time

//15:40 pm kenyan time 

cron.schedule(
  "40 15 * * *",
  () => {
    console.log(
      `[⏰ Triggering backup task at: ${new Date().toLocaleString("en-US", {
        timeZone: "Africa/Nairobi",
      })}]`
    );
    runTask();
  },
  {
    scheduled: true,
    timezone: "Africa/Nairobi",
  }
);
