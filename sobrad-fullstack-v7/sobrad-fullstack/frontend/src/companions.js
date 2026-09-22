import sobradAvatar from './assets/sobrad-avatar.jpg';
import friendsAvatar from './assets/friends-avatar.jpg';

// The two bundled built-in companions' avatar images and greeting text --
// unchanged, protected identity, exactly as before this file was repurposed.
// Every companion the app actually shows now (the two built-ins' live rows,
// always present per GET /api/companions, plus any custom companion the
// user has added) is driven by the backend's CompanionOut data instead of a
// static table here -- see pages/Chat.jsx and components/ChatPanel.jsx,
// which fetch the live list via api.getCompanions() and work with a
// *resolved* companion object (the raw row plus a display avatar/greeting,
// built by resolveCompanion() below) instead of a bare key string.
const BUILTIN_AVATARS = {
  sobrad: sobradAvatar,
  friends: friendsAvatar,
};

const BUILTIN_GREETINGS = {
  sobrad: "Hello. I'm glad you're here. What's on your mind?",
  friends: "Hey, how's it going so far?",
};

export function isBuiltinCompanion(key) {
  return key === 'sobrad' || key === 'friends';
}

// Bundled avatar image for a built-in companion, or undefined for anything
// else. Deliberately used regardless of that row's `has_avatar`/uploaded
// photo -- the built-ins' visual identity is protected, so an avatar
// upload on one of them (the backend allows it) never silently swaps its
// bundled image here. Custom companions have no bundled avatar at all.
export function bundledAvatar(key) {
  return BUILTIN_AVATARS[key];
}

// First-letter fallback, the same rule Sidebar.jsx's `.sidebar-avatar`
// initial-letter circle already uses (see index.css) -- reused here for a
// custom companion with no avatar photo set, so it never renders blank.
export function initialFor(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

// Display greeting for a companion row (anything with at least
// `key`/`name`, i.e. a CompanionOut) -- the two built-ins keep their
// existing bespoke line untouched; every custom companion gets a simple
// generic one instead.
export function greetingFor(companion) {
  if (!companion) return BUILTIN_GREETINGS.sobrad;
  if (isBuiltinCompanion(companion.key)) return BUILTIN_GREETINGS[companion.key];
  return `Hey, I'm ${companion.name}. What's on your mind?`;
}

// Combines a live `CompanionOut` row with its display avatar + greeting,
// for components to render directly (Chat.jsx's chat list, ChatPanel.jsx's
// thread, Topbar). `avatarUrl` is an already-resolved image src for a
// custom companion's uploaded photo -- a blob object URL fetched via
// api.getCompanionAvatarBlobUrl(), since a plain <img src="/api/..."> can't
// carry the auth header the endpoint needs (same pattern as journal photos,
// see api.js) -- or null/undefined while none is loaded or none is set. The
// two built-ins always resolve to their bundled image, never `avatarUrl`.
// `avatar` comes back null when there's nothing to show yet, in which case
// callers render the initial-letter fallback themselves (see
// CompanionRow/ChatPanel), never a broken/blank <img>.
export function resolveCompanion(companion, avatarUrl) {
  const avatar = bundledAvatar(companion.key) || avatarUrl || null;
  return {
    ...companion,
    avatar,
    initial: initialFor(companion.name),
    greeting: greetingFor(companion),
  };
}
