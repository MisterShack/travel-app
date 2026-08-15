export type Mail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * The provider seam. Everything above this interface only knows how to hand
 * over a message, so swapping Resend for something else — or for nothing, in
 * tests — touches one file.
 */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development default: prints the message, links and all, to the terminal. */
export class ConsoleMailer implements Mailer {
  send(mail: Mail): Promise<void> {
    console.info(
      `\n--- mail ---\nto: ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n------------\n`,
    );
    return Promise.resolve();
  }
}

/** Test double: records instead of sending, so tests can read the link back. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }

  lastTo(email: string): Mail | undefined {
    return [...this.sent].reverse().find((m) => m.to.toLowerCase() === email.toLowerCase());
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export class MailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailerError';
  }
}

/**
 * Resend over plain `fetch` rather than their SDK: the SDK requires Node 20+
 * and this is a single POST. One less dependency, one less version constraint.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: Mail): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new MailerError(`Resend rejected the message (${response.status}): ${body.slice(0, 200)}`);
    }
  }
}

export function createMailer(options: {
  resendApiKey: string | undefined;
  from: string;
}): Mailer {
  return options.resendApiKey === undefined
    ? new ConsoleMailer()
    : new ResendMailer(options.resendApiKey, options.from);
}
