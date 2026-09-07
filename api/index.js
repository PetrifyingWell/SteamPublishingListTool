// Vercel auto-detects files under /api as serverless functions. Exporting
// the Express app directly lets @vercel/node wrap it as the handler for
// every request routed here (see the rewrite in vercel.json).
module.exports = require('../server.js');
