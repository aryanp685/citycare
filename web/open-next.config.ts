import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache on purpose: every data page is dynamic (reads the session
// cookie), and the three static routes (/login, /signup, /_not-found) are served as
// plain assets. Adding R2 here would only add a bucket to babysit.
export default defineCloudflareConfig({});
