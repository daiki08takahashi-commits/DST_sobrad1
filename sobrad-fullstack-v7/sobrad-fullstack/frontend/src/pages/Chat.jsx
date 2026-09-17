import Topbar from '../components/Topbar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { useSettings } from '../SettingsContext.jsx';
import { getCompanion } from '../companions.js';

export default function Chat() {
  const { settings } = useSettings();
  const companion = getCompanion(settings.companion);
  return (
    <>
      <Topbar title="Chat" avatarSrc={companion.avatar} />
      <div className="screen-inner chat-screen">
        <ChatPanel />
      </div>
    </>
  );
}
