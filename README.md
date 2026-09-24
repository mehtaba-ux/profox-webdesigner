<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8d172d53-5633-4b8b-970c-c29d8fc582f0

## Developer UI rules

Before changing product UI, read [`docs/UI_ICON_POLICY.md`](docs/UI_ICON_POLICY.md). The prohibited sparkle/glint icon family is a system-wide design rule and is enforced by CI.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
