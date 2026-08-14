/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proof-of-concept: no SSR/API routes needed, everything reads Supabase
  // client-side with the public anon key. `next build` with output:'export'
  // emits a fully static site into out/ -- no Netlify Next.js plugin needed.
  output: 'export',
};

module.exports = nextConfig;
