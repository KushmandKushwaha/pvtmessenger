export type PresenceUser = {
  publicId: string;
  username: string | null;
  online: boolean;
  lastSeenAt: string | null;
};

export type PresenceEvent =
  | { type: "presence_sync"; users: PresenceUser[] }
  | { type: "presence_update"; user: PresenceUser }
  | {
      type: "typing";
      conversationId: string;
      user: { publicId: string; username: string | null };
      isTyping: boolean;
    };
