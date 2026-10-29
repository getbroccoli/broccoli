import type {
  Mailer,
  MailMessage,
  MailRefusedError,
  MailTransport,
} from "../../src/integrations/mail";

export interface FakeMail {
  transports: MailTransport[];
  relayTransports: { url: string; credential: string }[];
  messages: MailMessage<unknown>[];
  verifiedUrls: string[];
  verificationError: MailRefusedError | null;
  sendError: MailRefusedError | null;
  createMailer(transport: MailTransport): Mailer;
  createRelayMailer(transport: { url: string; credential: string }): Mailer;
  verifySmtpServer(url: string): Promise<void>;
}

export function fakeMail(): FakeMail {
  const fake: FakeMail = {
    transports: [],
    relayTransports: [],
    messages: [],
    verifiedUrls: [],
    verificationError: null,
    sendError: null,
    createMailer(transport) {
      fake.transports.push(transport);
      return recordingMailer(fake);
    },
    createRelayMailer(transport) {
      fake.relayTransports.push(transport);
      return recordingMailer(fake);
    },
    verifySmtpServer(url) {
      fake.verifiedUrls.push(url);
      return fake.verificationError ? Promise.reject(fake.verificationError) : Promise.resolve();
    },
  };
  return fake;
}

function recordingMailer(fake: FakeMail): Mailer {
  return {
    send(message) {
      if (fake.sendError) return Promise.reject(fake.sendError);
      fake.messages.push(message);
      return Promise.resolve({ messageId: "email-1" });
    },
  };
}
