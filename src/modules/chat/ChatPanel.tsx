import { useChat } from '../../hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { CliSelector } from './CliSelector';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { AlertCircle } from 'lucide-react';

export function ChatPanel() {
  const {
    availableClis,
    selectedCli,
    selectCli,
    conversation,
    createNewConversation,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    isConnecting,
    error,
    clearError,
  } = useChat();

  // Show CLI selector when no conversation is active
  const showCliSelector = !conversation;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-app)',
      }}
    >
      {/* Header */}
      <ChatHeader
        cli={selectedCli}
        isConnected={isConnected}
        isConnecting={isConnecting}
        onSettings={() => {
          // TODO: Open settings modal
          console.log('Open settings');
        }}
        onClose={() => {
          // TODO: Close chat panel
          console.log('Close chat');
        }}
      />

      {/* Error Banner */}
      {error && (
        <div
          className="flex items-center gap-3 px-6 py-3"
          style={{
            background: 'rgba(255, 183, 178, 0.2)',
            borderBottom: '1px solid rgba(255, 183, 178, 0.3)',
          }}
        >
          <AlertCircle size={18} color="#D48984" />
          <span
            className="flex-1 text-sm"
            style={{ color: '#D48984' }}
          >
            {error}
          </span>
          <button
            onClick={clearError}
            className="px-3 py-1 text-xs font-medium rounded-md transition-all duration-200"
            style={{
              background: 'rgba(212, 137, 132, 0.2)',
              color: '#D48984',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(212, 137, 132, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(212, 137, 132, 0.2)';
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* Main Content */}
      {showCliSelector ? (
        <CliSelector
          clis={availableClis}
          selectedCli={selectedCli}
          onSelectCli={selectCli}
          onStartConversation={createNewConversation}
          isLoading={isLoading}
        />
      ) : (
        <>
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            isConnecting={isConnecting}
          />
          <ChatInput
            onSend={sendMessage}
            isStreaming={isStreaming}
            isConnected={isConnected}
          />
        </>
      )}
    </div>
  );
}
