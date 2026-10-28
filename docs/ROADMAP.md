# Product roadmap

## MVP (this starter)
- Auth: email/password
- Community: create and join with invite code
- Channels: one `#general` per community
- Chat: persisted text and realtime updates

## MVP+ (next)
- Password reset / resend confirmation email
- Create and rename channels
- User profile settings and avatar
- Community settings and invite-code rotation
- Message pagination, replies, reactions
- Friend requests and direct messages
- Report, block, mute, and moderator actions

## Desktop
- Wrap the web client in Tauri once web auth, deep links, and builds are stable.
- Keep secrets on the backend; the Tauri client is still an untrusted client.

## Mobile
- Use Expo + React Native for a mobile-native experience.
- Reuse Supabase schema and auth; do not try to share all React DOM components directly.
