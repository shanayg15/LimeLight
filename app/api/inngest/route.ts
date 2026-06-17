import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { auditRunFn, trackingCronFn, digestFn } from "@/lib/inngest/functions";

// GET = dev-server discovery/introspection, PUT = function sync, POST = invoke.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [auditRunFn, trackingCronFn, digestFn],
});
