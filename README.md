<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a98a8d7e-d157-4c04-91de-2e67134af7d2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Render Hosting & Firebase Setup

- Build command: `npm install && npm run build`
- Publish directory: `dist` (configured in `render.yaml`)
- After deploying to Render (`https://<your-app>.onrender.com`), open Firebase Console -> **Authentication** -> **Settings** -> **Authorized domains** and add your Render domain (`<your-app>.onrender.com`), and ensure **Google** sign-in provider is enabled.

