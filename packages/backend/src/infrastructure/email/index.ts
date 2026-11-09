// Which EmailSender runs is configuration (`EMAIL_SENDER`, architecture §3.7). A new sender is an
// adapter here and a case in `EmailConfig`; nothing above the port knows which one is in use.
import type { EmailSender } from '../../application/ports/index.js';
import type { EmailConfig } from '../../config.js';
import { consoleEmailSender } from './console.js';
import { mailpitEmailSender } from './mailpit.js';
import { resendEmailSender } from './resend.js';

export function createEmailSender(config: EmailConfig): EmailSender {
	switch (config.kind) {
		case 'console':
			return consoleEmailSender();
		case 'mailpit':
			return mailpitEmailSender(config);
		case 'resend':
			return resendEmailSender(config);
	}
}
