import Topbar from '../components/Topbar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function Chat() {
  return (
    <>
      <Topbar title="Chat" />
      <div className="screen-inner chat-screen">
        <ChatPanel />
      </div>
    </>
  );
}
