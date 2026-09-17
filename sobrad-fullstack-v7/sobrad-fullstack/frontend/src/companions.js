import sobradAvatar from './assets/sobrad-avatar.jpg';
import friendsAvatar from './assets/friends-avatar.jpg';

// The two companions, each with its own fully separate chat thread (see
// pages/Chat.jsx's companion list -> thread router, and api.js's
// companion-scoped getChatHistory/sendChatMessage/clearChatHistory) --
// each just an avatar image, display name and opening chat greeting.
// 'sobrad' is the original, calmer persona; 'friends' is a more casual,
// buddy-like alternative. This is presentation only -- it doesn't touch the
// AI reply itself (see backend/app/routers/chat.py's SYSTEM_PROMPT, which
// still speaks as "Sõbrad" regardless of which persona the UI is showing).
export const COMPANIONS = {
  sobrad: {
    key: 'sobrad',
    name: 'Sõbrad',
    avatar: sobradAvatar,
    greeting: "Hello. I'm glad you're here. What's on your mind?",
  },
  friends: {
    key: 'friends',
    name: 'Friends',
    avatar: friendsAvatar,
    greeting: "Hey, how's it going so far?",
  },
};

// Falls back to 'sobrad' for an unset/unrecognized value, so the app never
// renders a blank persona -- matches the backend default in models.py.
export function getCompanion(key) {
  return COMPANIONS[key] || COMPANIONS.sobrad;
}
