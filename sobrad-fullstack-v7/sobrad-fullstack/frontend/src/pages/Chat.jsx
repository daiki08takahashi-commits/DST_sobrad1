import Topbar from '../components/Topbar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import sobradAvatar from '../assets/sobrad-avatar.jpg';

export default function Chat() {
  return (
    <>
      <Topbar title="Chat" avatarSrc={sobradAvatar} />
      <div className="screen-inner chat-screen">
        <ChatPanel />
      </div>
    </>
  );
}
