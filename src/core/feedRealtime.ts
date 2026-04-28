export const FEED_WS_MESSAGE_EVENT = "abo:feed-ws-message";

export type FeedRealtimePayload = Record<string, unknown> & {
  type?: string;
  module?: string;
  session_id?: string;
  count?: number;
  error?: string;
  paper?: Record<string, unknown>;
};
