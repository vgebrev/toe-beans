import type { Result } from '../../domain/result.js';

export interface EmailMessage {
	to: string;
	subject: string;
	/** Plain text only: names people typed go in unescaped, and there's no HTML to inject into. */
	text: string;
}

/** Why a message didn't go out. For logs, so it must not carry the address or the text. */
export interface EmailFailure {
	reason: string;
}

/** Sends transactional email (architecture §3.7). Never call it inside a UnitOfWork. */
export interface EmailSender {
	send(message: EmailMessage): Promise<Result<void, EmailFailure>>;
}
